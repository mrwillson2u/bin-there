import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { locations, units, events } from "./db/schema";
import { ApiError } from "./errors";
import { locationItems } from "./items";
import { isPinned } from "./pins";
import type { CreateLocation, Crumb, LocationDetail, LocationSummary, PinnedLocation, UpdateLocation } from "../shared/api";

// Written out in full: an interpolated column renders unqualified and would bind to the inner `c`.
const childCount = sql<number>`(select count(*) from locations c where c.parent_id = "locations"."id" and c.archived = 0)`;

const summaryColumns = {
  id: locations.id,
  name: locations.name,
  type: locations.type,
  code: locations.code,
  binSize: locations.binSize,
  childCount,
};

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
    .all();
}

/** Summaries with breadcrumb paths, in the order given (skipping archived or missing ones). */
export function listLocationsByIds(db: Db, ids: number[]): PinnedLocation[] {
  if (ids.length === 0) return [];
  const rows = db.select(summaryColumns).from(locations).where(and(inArray(locations.id, ids), eq(locations.archived, false))).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ ...r, path: locationPath(db, id) }] : [];
  });
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
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    code: loc.code,
    binSize: loc.binSize,
    parentId: loc.parentId,
    notes: loc.notes,
    childCount: listLocations(db, loc.id).length,
    path: locationPath(db, loc.id),
    children: listLocations(db, loc.id),
    items: locationItems(db, loc.id),
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

function assertParentOk(db: Db, id: number | undefined, parentId: number | null | undefined) {
  if (parentId == null) return;
  const parent = db.select({ id: locations.id }).from(locations).where(eq(locations.id, parentId)).get();
  if (!parent) throw new ApiError(400, "VALIDATION", `Parent location ${parentId} does not exist`);
  if (id !== undefined && locationPath(db, parentId).some((c) => c.id === id)) {
    throw new ApiError(400, "VALIDATION", "A location can't be moved inside itself");
  }
}

export function createLocation(db: Db, input: CreateLocation): LocationDetail {
  if (input.code) assertCodeFree(db, input.code);
  assertParentOk(db, undefined, input.parentId);
  const id = db.transaction((tx) => {
    const row = tx
      .insert(locations)
      .values({
        name: input.name,
        type: input.type,
        parentId: input.parentId ?? null,
        code: input.code ?? null,
        binSize: input.type === "bin" ? (input.binSize ?? null) : null,
        notes: input.notes ?? null,
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
  assertParentOk(db, id, input.parentId);
  db.transaction((tx) => {
    tx.update(locations)
      .set({ ...input, updatedAt: sql`(datetime('now'))` })
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

export function assignLocationCode(db: Db, id: number, code: string): LocationDetail {
  getLocation(db, id);
  assertCodeFree(db, code, id);
  db.transaction((tx) => {
    tx.update(locations).set({ code, updatedAt: sql`(datetime('now'))` }).where(eq(locations.id, id)).run();
    tx.insert(events).values({ type: "assign_code", locationId: id }).run();
  });
  return getLocation(db, id);
}
