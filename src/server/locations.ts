import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, itemHomes, items, locations, pins, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { locationItems } from "./items";
import { isPinned } from "./pins";
import type { BinSize, CreateLocation, Crumb, LocationDetail, LocationSummary, PinnedLocation, UpdateLocation } from "../shared/api";
import { DEFAULT_GRID, slotProblem, type Grid, type PlacedBin, type Slot } from "../shared/grid";

// Written out in full: an interpolated column renders unqualified and would bind to the inner `c`.
const childCount = sql<number>`(select count(*) from locations c where c.parent_id = "locations"."id" and c.archived = 0)`;

const summaryColumns = {
  id: locations.id,
  name: locations.name,
  type: locations.type,
  code: locations.code,
  binSize: locations.binSize,
  gridX: locations.gridX,
  gridY: locations.gridY,
  gridRotated: locations.gridRotated,
  childCount,
};

type SummaryRow = { gridX: number | null; gridY: number | null; gridRotated: boolean };

function slotOf(row: SummaryRow): Slot | null {
  return row.gridX !== null && row.gridY !== null ? { x: row.gridX, y: row.gridY, rotated: row.gridRotated } : null;
}

/** Names of the items kept right here (stock or stickered units), A–Z. */
function contents(db: Db, locationId: number): string[] {
  return db
    .select({ name: items.name })
    .from(items)
    .where(
      and(
        eq(items.archived, false),
        sql`(${items.id} in (select item_id from stock where location_id = ${locationId})
          or ${items.id} in (select item_id from units where location_id = ${locationId} and status <> 'retired'))`,
      ),
    )
    .orderBy(items.name)
    .all()
    .map((r) => r.name);
}

function toSummary(db: Db, { gridX, gridY, gridRotated, ...row }: SummaryRow & Omit<LocationSummary, "slot" | "itemCount" | "preview">): LocationSummary {
  const names = contents(db, row.id);
  return { ...row, slot: slotOf({ gridX, gridY, gridRotated }), itemCount: names.length, preview: names.slice(0, 2) };
}

export function listLocations(db: Db, parentId: number | null): LocationSummary[] {
  return db
    .select(summaryColumns)
    .from(locations)
    .where(
      and(
        eq(locations.archived, false),
        parentId === null ? isNull(locations.parentId) : eq(locations.parentId, parentId),
      ),
    )
    .orderBy(locations.name)
    .all()
    .map((r) => toSummary(db, r));
}

/** Summaries with breadcrumb paths, in the order given (skipping archived or missing ones). */
export function listLocationsByIds(db: Db, ids: number[]): PinnedLocation[] {
  if (ids.length === 0) return [];
  const rows = db.select(summaryColumns).from(locations).where(and(inArray(locations.id, ids), eq(locations.archived, false))).all();
  const byId = new Map(rows.map((r) => [r.id, toSummary(db, r)]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ ...r, path: locationPath(db, id) }] : [];
  });
}

/** Every gridded box is the Allit case (6 × 4 + front strip) unless told otherwise. */
function gridOf(loc: { type: string; gridCols: number | null; gridRows: number | null }): Grid | null {
  if (loc.type !== "gridded_box") return null;
  return { cols: loc.gridCols ?? DEFAULT_GRID.cols, rows: loc.gridRows ?? DEFAULT_GRID.rows };
}

/** Ancestors from the top level down to (and including) the location. */
export function locationPath(db: Db, id: number): Crumb[] {
  const rows = db.all<Crumb & { depth: number }>(sql`
    with recursive chain(id, name, parent_id, depth) as (
      select id, name, parent_id, 0 from locations where id = ${id}
      union all
      select l.id, l.name, l.parent_id, chain.depth + 1
      from locations l join chain on l.id = chain.parent_id
    )
    select id, name, depth from chain order by depth desc
  `);
  return rows.map(({ id, name }) => ({ id, name }));
}

export function getLocation(db: Db, id: number): LocationDetail {
  const loc = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!loc || loc.archived) throw new ApiError(404, "NOT_FOUND", `No location ${id}`);
  const children = listLocations(db, loc.id);
  const here = locationItems(db, loc.id);
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    code: loc.code,
    binSize: loc.binSize,
    slot: slotOf(loc),
    parentId: loc.parentId,
    notes: loc.notes,
    grid: gridOf(loc),
    childCount: children.length,
    itemCount: here.length,
    preview: here.slice(0, 2).map((i) => i.name),
    path: locationPath(db, loc.id),
    children,
    items: here,
    pinned: isPinned(db, "location", loc.id),
  };
}

function assertCodeFree(db: Db, code: string, exceptLocationId?: number) {
  const loc = db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get();
  const unit = db.select({ id: units.id }).from(units).where(eq(units.code, code)).get();
  if ((loc && loc.id !== exceptLocationId) || unit) {
    throw new ApiError(409, "CONFLICT", `Sticker ${code} is already assigned`);
  }
}

/** Sites are the top level; everything else lives inside a site (or inside something in one). */
function assertPlacement(type: string, parentId: number | null | undefined) {
  if (type === "site" && parentId != null) throw new ApiError(400, "VALIDATION", "A site can't go inside another location");
  if (type !== "site" && parentId == null) throw new ApiError(400, "VALIDATION", "This needs to go inside a site or another location");
}

function assertParentOk(db: Db, id: number | undefined, parentId: number | null | undefined) {
  if (parentId == null) return;
  const parent = db.select({ id: locations.id }).from(locations).where(eq(locations.id, parentId)).get();
  if (!parent) throw new ApiError(400, "VALIDATION", `Parent location ${parentId} does not exist`);
  if (id !== undefined && locationPath(db, parentId).some((c) => c.id === id)) {
    throw new ApiError(400, "VALIDATION", "A location can't be moved inside itself");
  }
}

/**
 * "Bin N" with the next number in this box (DEC-020). Archived bins keep their number
 * so an old log line never points at a different bin.
 */
function nextBinName(db: Db, parentId: number): string {
  const names = db.select({ name: locations.name }).from(locations).where(eq(locations.parentId, parentId)).all();
  const used = names.map((r) => /^Bin (\d+)$/.exec(r.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  return `Bin ${Math.max(0, ...used) + 1}`;
}

/** Where a bin may go: on its gridded box's grid, not on top of another bin. The slot's values, or a 400/409. */
function checkSlot(db: Db, parentId: number | null, binId: number | null, binSize: BinSize | null, slot: Slot) {
  const parent = parentId === null ? null : getLocation(db, parentId);
  if (!parent?.grid) throw new ApiError(400, "VALIDATION", "This bin isn't in a gridded box");
  const others: PlacedBin[] = parent.children
    .filter((c): c is LocationSummary & { slot: Slot } => c.id !== binId && c.type === "bin" && c.slot !== null)
    .map((c) => ({ id: c.id, binSize: c.binSize, slot: c.slot }));
  const problem = slotProblem(binSize, slot, parent.grid, others);
  if (problem) throw new ApiError(409, "CONFLICT", problem);
}

export function createLocation(db: Db, input: CreateLocation): LocationDetail {
  if (input.code) assertCodeFree(db, input.code);
  assertPlacement(input.type, input.parentId);
  assertParentOk(db, undefined, input.parentId);
  const isBin = input.type === "bin";
  if (!input.name && !isBin) throw new ApiError(400, "VALIDATION", "This needs a name");
  const slot = isBin && input.slot ? { x: input.slot.x, y: input.slot.y, rotated: input.slot.rotated ?? false } : null;
  const binSize = isBin ? (input.binSize ?? null) : null;
  if (slot) checkSlot(db, input.parentId ?? null, null, binSize, slot);
  const name = input.name ?? nextBinName(db, input.parentId!);
  const id = db.transaction((tx) => {
    const row = tx
      .insert(locations)
      .values({
        name,
        type: input.type,
        parentId: input.parentId ?? null,
        code: input.code ?? null,
        binSize,
        notes: input.notes ?? null,
        gridX: slot?.x ?? null,
        gridY: slot?.y ?? null,
        gridRotated: slot?.rotated ?? false,
      })
      .returning({ id: locations.id })
      .get();
    tx.insert(events).values({ type: "create", locationId: row.id, toLocationId: input.parentId ?? null }).run();
    return row.id;
  });
  return getLocation(db, id);
}

export function updateLocation(db: Db, id: number, input: UpdateLocation): LocationDetail {
  const before = getLocation(db, id);
  if (input.code) assertCodeFree(db, input.code, id);
  if (input.type !== undefined || input.parentId !== undefined) {
    assertPlacement(input.type ?? before.type, input.parentId !== undefined ? input.parentId : before.parentId);
  }
  assertParentOk(db, id, input.parentId);
  // A bin's slot only means something in the box it was placed in, at the size it had.
  const leavesSlot =
    (input.parentId !== undefined && input.parentId !== before.parentId) ||
    (input.type !== undefined && input.type !== before.type) ||
    (input.binSize !== undefined && input.binSize !== before.binSize);
  const clearSlot = leavesSlot ? { gridX: null, gridY: null, gridRotated: false } : {};
  db.transaction((tx) => {
    tx.update(locations)
      .set({ ...input, ...clearSlot, updatedAt: sql`(datetime('now'))` })
      .where(eq(locations.id, id))
      .run();
    if (input.parentId !== undefined && input.parentId !== before.parentId) {
      tx.insert(events)
        .values({ type: "move", locationId: id, fromLocationId: before.parentId, toLocationId: input.parentId })
        .run();
    }
  });
  return getLocation(db, id);
}

/** Soft delete an empty location: hidden from lists and scans, history kept. Its sticker is freed. */
export function archiveLocation(db: Db, id: number): { parentId: number | null } {
  const loc = getLocation(db, id);
  if (loc.children.length > 0) throw new ApiError(400, "VALIDATION", "Move or delete what's inside it first");
  if (loc.items.length > 0) throw new ApiError(400, "VALIDATION", "Move its items somewhere else first");
  db.transaction((tx) => {
    tx.update(locations).set({ archived: true, code: null, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    tx.delete(itemHomes).where(eq(itemHomes.locationId, id)).run();
    tx.update(units).set({ homeLocationId: null }).where(eq(units.homeLocationId, id)).run();
    tx.delete(pins).where(eq(pins.locationId, id)).run();
    tx.insert(events).values({ type: "archive", locationId: id, fromLocationId: loc.parentId }).run();
  });
  return { parentId: loc.parentId };
}

/** Put a bin in a slot of its gridded box (or take it off the grid with null). Not logged: it's layout, not stock. */
export function placeBin(db: Db, id: number, slot: Slot | null): LocationDetail {
  const bin = getLocation(db, id);
  if (bin.type !== "bin") throw new ApiError(400, "VALIDATION", "Only bins go on the grid");
  if (slot !== null) checkSlot(db, bin.parentId, id, bin.binSize, slot);
  db.update(locations)
    .set({
      gridX: slot?.x ?? null,
      gridY: slot?.y ?? null,
      gridRotated: slot?.rotated ?? false,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(locations.id, id))
    .run();
  return getLocation(db, id);
}

export function assignLocationCode(db: Db, id: number, code: string): LocationDetail {
  getLocation(db, id);
  assertCodeFree(db, code, id);
  db.transaction((tx) => {
    tx.update(locations).set({ code, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    tx.insert(events).values({ type: "assign_code", locationId: id }).run();
  });
  return getLocation(db, id);
}
