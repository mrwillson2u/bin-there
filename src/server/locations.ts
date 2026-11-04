import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, itemHomes, items, locations, pins, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { locationItems, photoUrl } from "./items";
import { isPinned } from "./pins";
import { comparePlaces, holdsPositions, rackLabel, type BinOut, type BinSize, type CreateLocation, type Crumb, type LocationDetail, type LocationSummary, type PinnedLocation, type UpdateLocation } from "../shared/api";
import { DEFAULT_GRID, slotProblem, type Grid, type PlacedBin, type Slot } from "../shared/grid";
import { rackMove, type RackRow } from "../shared/rack";

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
  outAt: locations.outAt,
  outToId: locations.outToId,
  outNote: locations.outNote,
  rackSlot: locations.rackSlot,
  parentId: locations.parentId,
  childCount,
};

type SummaryRow = { gridX: number | null; gridY: number | null; gridRotated: boolean };
type OutRow = { outAt: string | null; outToId: number | null; outNote: string | null };

/** Where a bin that's been taken out is (DEC-028), or null when it's in its box. */
export function outOf(db: Db, row: OutRow): BinOut | null {
  if (row.outAt === null) return null;
  const to = row.outToId === null ? undefined : db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.id, row.outToId)).get();
  return { at: row.outAt, to: to ?? null, note: row.outNote };
}

function slotOf(row: SummaryRow): Slot | null {
  return row.gridX !== null && row.gridY !== null ? { x: row.gridX, y: row.gridY, rotated: row.gridRotated } : null;
}

/** For a bin's tile (DEC-036): the main photo of the first part in it, A to Z, that has a photo. */
function firstThumb(db: Db, locationId: number): { thumbUrl: string | null; thumbName: string | null } {
  const row = db.get<{ path: string; thumb_path: string | null; name: string }>(sql`
    select p.path, p.thumb_path, i.name from photos p join items i on i.id = p.item_id
    where i.archived = 0 and (i.id in (select item_id from stock where location_id = ${locationId})
      or i.id in (select item_id from units where location_id = ${locationId} and status <> 'retired'))
    order by i.name collate nocase, p.is_main desc, p.id
    limit 1`);
  return row ? { thumbUrl: photoUrl(row.thumb_path ?? row.path), thumbName: row.name } : { thumbUrl: null, thumbName: null };
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

/** A parent's position labels (DEC-034), looked up once per parent. */
function labelsOf(db: Db, cache: Map<number, (string | null)[] | null>, parentId: number | null) {
  if (parentId === null) return null;
  if (!cache.has(parentId)) cache.set(parentId, db.select({ l: locations.rackLabels }).from(locations).where(eq(locations.id, parentId)).get()?.l ?? null);
  return cache.get(parentId)!;
}

function toSummary(
  db: Db,
  { gridX, gridY, gridRotated, outAt, outToId, outNote, parentId, ...row }: SummaryRow &
    OutRow & { parentId: number | null } & Omit<LocationSummary, "slot" | "itemCount" | "preview" | "out" | "position" | "thumbUrl" | "thumbName">,
  labels: Map<number, (string | null)[] | null> = new Map(),
): LocationSummary {
  const names = contents(db, row.id);
  return {
    ...row,
    slot: slotOf({ gridX, gridY, gridRotated }),
    itemCount: names.length,
    preview: names.slice(0, 2),
    out: outOf(db, { outAt, outToId, outNote }),
    position: row.rackSlot === null ? null : rackLabel(labelsOf(db, labels, parentId), row.rackSlot),
    ...(row.type === "bin" && names.length > 0 ? firstThumb(db, row.id) : { thumbUrl: null, thumbName: null }),
  };
}

export function listLocations(db: Db, parentId: number | null): LocationSummary[] {
  const labels = new Map<number, (string | null)[] | null>();
  return db
    .select(summaryColumns)
    .from(locations)
    .where(
      and(
        eq(locations.archived, false),
        parentId === null ? isNull(locations.parentId) : eq(locations.parentId, parentId),
      ),
    )
    .all()
    .map((r) => toSummary(db, r, labels))
    .sort(comparePlaces);
}

/**
 * Every place, whatever it's inside, with its path (DEC-027), in tree order: each place right
 * after the one it's in. With only one site, the site itself is left out.
 */
export function listAllLocations(db: Db): PinnedLocation[] {
  const tree = db
    .select({ id: locations.id, name: locations.name, parentId: locations.parentId, rackSlot: locations.rackSlot, rackLabels: locations.rackLabels })
    .from(locations)
    .all();
  const byId = new Map(tree.map((r) => [r.id, r]));
  const labelOf = (r: (typeof tree)[number]) => {
    const parent = r.parentId === null ? undefined : byId.get(r.parentId);
    return r.rackSlot === null ? null : rackLabel(parent?.rackLabels, r.rackSlot);
  };
  const pathOf = (id: number): Crumb[] => {
    const out: Crumb[] = [];
    for (let cur = byId.get(id); cur && out.length < 50; cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
      out.unshift({ id: cur.id, name: cur.name, position: labelOf(cur) });
    }
    return out;
  };
  const rows = db.select(summaryColumns).from(locations).where(eq(locations.archived, false)).all();
  const oneSite = rows.filter((r) => r.type === "site").length === 1;
  // Tree order: compare step by step, each step in the order places sit (DEC-034).
  const byPath = (a: Crumb[], b: Crumb[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i]!.id !== b[i]!.id) return comparePlaces(byId.get(a[i]!.id)!, byId.get(b[i]!.id)!) || a[i]!.id - b[i]!.id;
    }
    return a.length - b.length;
  };
  const labels = new Map<number, (string | null)[] | null>();
  return rows
    .filter((r) => !(oneSite && r.type === "site"))
    .map((r) => ({ ...toSummary(db, r, labels), path: pathOf(r.id) }))
    .sort((a, b) => byPath(a.path, b.path));
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
  const rows = db.all<{ id: number; name: string; rack_slot: number | null; rack_labels: string | null; depth: number }>(sql`
    with recursive chain(id, name, rack_slot, rack_labels, parent_id, depth) as (
      select id, name, rack_slot, rack_labels, parent_id, 0 from locations where id = ${id}
      union all
      select l.id, l.name, l.rack_slot, l.rack_labels, l.parent_id, chain.depth + 1
      from locations l join chain on l.id = chain.parent_id
    )
    select id, name, rack_slot, rack_labels, depth from chain order by depth desc
  `);
  // Each step's position label comes from the step before it (its parent's labels, DEC-034).
  return rows.map((r, i) => {
    const parentLabels = i > 0 && rows[i - 1]!.rack_labels ? (JSON.parse(rows[i - 1]!.rack_labels!) as (string | null)[]) : null;
    return { id: r.id, name: r.name, position: r.rack_slot === null ? null : rackLabel(parentLabels, r.rack_slot) };
  });
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
    rackSlot: loc.rackSlot,
    position: loc.rackSlot === null ? null : rackLabel(labelsOf(db, new Map(), loc.parentId), loc.rackSlot),
    ...(loc.type === "bin" && here.length > 0 ? firstThumb(db, loc.id) : { thumbUrl: null, thumbName: null }),
    tileView: loc.tileView ?? "photos",
    rack: holdsPositions(loc.type) && loc.rackSize ? { size: loc.rackSize, labels: Array.from({ length: loc.rackSize }, (_, i) => loc.rackLabels?.[i] ?? null) } : null,
    parentId: loc.parentId,
    parentType: loc.parentId === null ? null : (db.select({ type: locations.type }).from(locations).where(eq(locations.id, loc.parentId)).get()?.type ?? null),
    notes: loc.notes,
    grid: gridOf(loc),
    childCount: children.length,
    itemCount: here.length,
    preview: here.slice(0, 2).map((i) => i.name),
    path: locationPath(db, loc.id),
    children,
    items: here,
    pinned: isPinned(db, "location", loc.id),
    out: outOf(db, loc),
    outHere:
      loc.type === "project"
        ? listLocationsByIds(
            db,
            db.select({ id: locations.id }).from(locations).where(and(eq(locations.outToId, loc.id), eq(locations.archived, false))).orderBy(locations.outAt).all().map((r) => r.id),
          )
        : [],
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
 * "Bin 0042": the next ID in the whole system (DEC-023), so a bin keeps a unique name
 * when it moves to another box. Fixed width so it reads as an ID and sorts right.
 * Archived bins keep theirs, so an old log line never points at a different bin.
 */
function nextBinName(db: Db): string {
  const row = db.get<{ n: number | null }>(sql`
    select max(cast(substr(name, 5) as integer)) as n from locations
    where type = 'bin' and name glob 'Bin [0-9]*' and name not glob 'Bin *[^0-9]*'
  `);
  return `Bin ${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** Where a bin may go: on its gridded box's grid, not on top of another bin. The slot's values, or a 400/409. */
function checkSlot(db: Db, parentId: number | null, binId: number | null, binSize: BinSize | null, slot: Slot) {
  const parent = parentId === null ? null : getLocation(db, parentId);
  if (!parent?.grid) throw new ApiError(400, "VALIDATION", "This bin isn't in a gridded box");
  const others: PlacedBin[] = parent.children
    .filter((c): c is LocationSummary & { slot: Slot } => c.id !== binId && c.type === "bin" && c.slot !== null)
    .map((c) => ({ id: c.id, binSize: c.binSize, slot: c.slot, outName: c.out ? c.name : undefined }));
  const problem = slotProblem(binSize, slot, parent.grid, others);
  if (problem) throw new ApiError(409, "CONFLICT", problem);
}

/** The place a rack slot is asked for in, if it has positions and the slot is one of them. */
function requireRack(db: Db, parentId: number | null, slot: number) {
  const parent = parentId === null ? undefined : db.select().from(locations).where(eq(locations.id, parentId)).get();
  if (!parent || !holdsPositions(parent.type) || !parent.rackSize) throw new ApiError(400, "VALIDATION", "That place doesn't have positions");
  if (slot >= parent.rackSize) throw new ApiError(400, "VALIDATION", `${parent.name} has ${parent.rackSize} positions`);
  return parent;
}

function occupant(db: Db, parentId: number, slot: number, selfId?: number) {
  return db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.parentId, parentId), eq(locations.rackSlot, slot), eq(locations.archived, false)))
    .all()
    .find((r) => r.id !== selfId);
}

/**
 * How many positions a rack or shelf has (DEC-034). Setting it up for the first time puts what's
 * already inside into positions 1, 2, 3… in name order. It can't shrink past a position in use.
 */
export function setRackSize(db: Db, id: number, size: number | null): LocationDetail {
  const loc = getLocation(db, id);
  if (!holdsPositions(loc.type)) throw new ApiError(400, "VALIDATION", "Only racks and shelves have positions");
  const used = loc.children.filter((c) => c.rackSlot !== null).sort((a, b) => b.rackSlot! - a.rackSlot!);
  if (size !== null && used[0] && used[0].rackSlot! >= size) {
    throw new ApiError(409, "CONFLICT", `${used[0].name} is in position ${used[0].position}. Move it first`);
  }
  db.transaction((tx) => {
    tx.update(locations).set({ rackSize: size, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    if (size === null) {
      tx.update(locations).set({ rackSlot: null }).where(eq(locations.parentId, id)).run();
      return;
    }
    if (!loc.rack) {
      // First set-up: fill the positions with what's inside, in the order it's listed.
      const taken = new Set(used.map((c) => c.rackSlot!));
      let next = 0;
      for (const c of loc.children.filter((c) => c.rackSlot === null && c.type !== "project")) {
        while (taken.has(next)) next++;
        if (next >= size) break;
        tx.update(locations).set({ rackSlot: next }).where(eq(locations.id, c.id)).run();
        taken.add(next);
      }
    }
  });
  return getLocation(db, id);
}

/** Labels for a rack's positions (DEC-034); blank keeps the number. Each label once. */
export function setRackLabels(db: Db, id: number, labels: (string | null)[]): LocationDetail {
  const loc = getLocation(db, id);
  if (!loc.rack) throw new ApiError(400, "VALIDATION", "That place doesn't have positions");
  const next = Array.from({ length: loc.rack.size }, (_, i) => (i < labels.length ? labels[i]! : loc.rack!.labels[i]!) ?? null);
  const seen = new Map<string, number>();
  next.forEach((_, i) => {
    const l = rackLabel(next, i).toLowerCase();
    const other = seen.get(l);
    if (other !== undefined) throw new ApiError(409, "CONFLICT", `Positions ${other + 1} and ${i + 1} would both be ${rackLabel(next, i)}`);
    seen.set(l, i);
  });
  db.update(locations).set({ rackLabels: next.some((l) => l) ? next : null, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
  return getLocation(db, id);
}

/**
 * Put a place into a position of the rack it's in, or out of one (null). Dropped on a taken
 * position, the ones in between move along (DEC-035, see `rackMove`).
 */
export function placeInRack(db: Db, id: number, slot: number | null): LocationDetail {
  const loc = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!loc || loc.archived) throw new ApiError(404, "NOT_FOUND", `No location ${id}`);
  if (slot === null) {
    db.update(locations).set({ rackSlot: null, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    return getLocation(db, loc.parentId ?? id);
  }
  const parent = requireRack(db, loc.parentId, slot);
  const kids = db
    .select({ id: locations.id, rackSlot: locations.rackSlot })
    .from(locations)
    .where(and(eq(locations.parentId, parent.id), eq(locations.archived, false)))
    .all();
  const row: RackRow = Array.from({ length: parent.rackSize! }, () => null);
  for (const k of kids) if (k.rackSlot !== null && k.rackSlot < row.length) row[k.rackSlot] = k.id;
  const next = rackMove(row, id, slot);
  if (!next) throw new ApiError(409, "CONFLICT", `Every position in ${parent.name} is in use. Add one first`);
  db.transaction((tx) => {
    for (const k of kids) {
      const at = next.indexOf(k.id);
      const want = at < 0 ? (k.id === id ? null : k.rackSlot) : at;
      if (want !== k.rackSlot) tx.update(locations).set({ rackSlot: want, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, k.id)).run();
    }
  });
  return getLocation(db, parent.id);
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
  const rackSlot = input.rackSlot ?? null;
  if (rackSlot !== null) {
    requireRack(db, input.parentId ?? null, rackSlot);
    const other = occupant(db, input.parentId!, rackSlot);
    if (other) throw new ApiError(409, "CONFLICT", `${other.name} is already in that position`);
  }
  const rackSize = holdsPositions(input.type) ? (input.rackSize ?? null) : null;
  const name = input.name ?? nextBinName(db);
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
        rackSlot,
        rackSize,
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
  // Moved somewhere else for good: it's no longer out of its old box.
  const moving = input.parentId !== undefined && input.parentId !== before.parentId;
  const clearOut = moving ? { outAt: null, outToId: null, outNote: null } : {};
  // A position only means something in the place it was given in (DEC-034).
  const parentAfter = input.parentId !== undefined ? input.parentId : before.parentId;
  const { rackSlot: wantSlot, rackSize: _size, ...fields } = input;
  if (wantSlot !== undefined && wantSlot !== null) {
    requireRack(db, parentAfter, wantSlot);
    const other = occupant(db, parentAfter!, wantSlot, id);
    if (other) throw new ApiError(409, "CONFLICT", `${other.name} is already in that position`);
  }
  const position = wantSlot !== undefined ? { rackSlot: wantSlot } : moving ? { rackSlot: null } : {};
  db.transaction((tx) => {
    tx.update(locations)
      .set({ ...fields, ...clearSlot, ...clearOut, ...position, updatedAt: sql`(datetime('now'))` })
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
  if (loc.outHere.length > 0) throw new ApiError(400, "VALIDATION", `Put ${loc.outHere[0]!.name} back in its box first`);
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
/**
 * Take a bin out of its box (DEC-028), to a project kit or with a note. It stays the box's
 * child and keeps its grid spot, so putting it back returns it to the same place.
 */
export function takeOutBin(db: Db, id: number, input: { toLocationId?: number | null; note?: string | null }): LocationDetail {
  const bin = getLocation(db, id);
  if (bin.type !== "bin") throw new ApiError(400, "VALIDATION", "Only bins can be taken out");
  if (bin.out) throw new ApiError(409, "CONFLICT", `${bin.name} is already out`);
  const note = input.note?.trim() || null;
  const to = input.toLocationId ?? null;
  if (to === null && !note) throw new ApiError(400, "VALIDATION", "Pick the project kit it's going to, or add a note");
  if (to !== null) {
    const kit = db.select({ type: locations.type, archived: locations.archived }).from(locations).where(eq(locations.id, to)).get();
    if (!kit || kit.archived || kit.type !== "project") throw new ApiError(400, "VALIDATION", "A bin can be taken out to a project kit");
  }
  db.transaction((tx) => {
    tx.update(locations)
      .set({ outAt: sql`(datetime('now'))`, outToId: to, outNote: note, updatedAt: sql`(datetime('now'))` })
      .where(eq(locations.id, id))
      .run();
    tx.insert(events).values({ type: "check_out", locationId: id, fromLocationId: bin.parentId, toLocationId: to }).run();
  });
  return getLocation(db, id);
}

/** Put a bin that was taken out back in its box, in its saved spot. */
export function putBackBin(db: Db, id: number): LocationDetail {
  const bin = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!bin || bin.archived) throw new ApiError(404, "NOT_FOUND", `No location ${id}`);
  if (bin.outAt === null) throw new ApiError(409, "CONFLICT", `${bin.name} isn't out`);
  db.transaction((tx) => {
    tx.update(locations).set({ outAt: null, outToId: null, outNote: null, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    tx.insert(events).values({ type: "check_in", locationId: id, fromLocationId: bin.outToId, toLocationId: bin.parentId }).run();
  });
  return getLocation(db, id);
}

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

export function assignLocationCode(db: Db, id: number, code: string, opts: { move?: boolean } = {}): LocationDetail {
  getLocation(db, id);
  const holder = db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get();
  const moving = opts.move && holder && holder.id !== id ? holder.id : null;
  if (moving === null) assertCodeFree(db, code, id);
  else if (db.select({ id: units.id }).from(units).where(eq(units.code, code)).get()) {
    throw new ApiError(409, "CONFLICT", `Sticker ${code} is already assigned`);
  }
  db.transaction((tx) => {
    if (moving !== null) {
      tx.update(locations).set({ code: null, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, moving)).run();
    }
    tx.update(locations).set({ code, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    tx.insert(events).values({ type: "assign_code", locationId: id, fromLocationId: moving }).run();
  });
  return getLocation(db, id);
}
