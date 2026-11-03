import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { itemHomes, items, locations, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { archiveLocation, getLocation, locationPath } from "./locations";
import { checkInUnit, moveStock, moveUnit } from "./stock";
import type { ProjectSummary, ReturnResult } from "../shared/api";

// Project kits (J4, DEC-019): a `project` location that parts are pulled into for a
// while. Nothing ever calls a kit home (see isProject in items.ts), so "return" can
// send everything back to where it belongs, one logged, undoable move per thing.

export function listProjects(db: Db): ProjectSummary[] {
  const rows = db
    .select({ id: locations.id, name: locations.name, updatedAt: locations.updatedAt })
    .from(locations)
    .where(and(eq(locations.type, "project"), eq(locations.archived, false)))
    .orderBy(desc(locations.updatedAt))
    .all();
  return rows.map((r) => ({
    ...r,
    path: locationPath(db, r.id),
    items: db
      .select({ n: sql<number>`count(distinct item_id)` })
      .from(
        sql`(select item_id from stock where location_id = ${r.id}
             union select item_id from units where location_id = ${r.id} and status <> 'retired')`,
      )
      .get()!.n,
  }));
}

function requireProject(db: Db, id: number) {
  const loc = getLocation(db, id);
  if (loc.type !== "project") throw new ApiError(400, "VALIDATION", "That's not a project kit");
  return loc;
}

/**
 * Send what's in the kit back home: all of an item's stock to its (first) home, each
 * unit to its own home. Things with no home stay and are reported. With `finish`, an
 * emptied kit is deleted.
 */
export function returnFromProject(db: Db, id: number, opts: { itemId?: number; finish?: boolean } = {}): ReturnResult {
  requireProject(db, id);
  const result: ReturnResult = { returned: 0, left: [], finished: false };
  const only = opts.itemId;

  const stockRows = db
    .select({ s: stock, name: items.name, archived: items.archived })
    .from(stock)
    .innerJoin(items, eq(items.id, stock.itemId))
    .where(and(eq(stock.locationId, id), ...(only ? [eq(stock.itemId, only)] : [])))
    .all();
  for (const { s, name, archived } of stockRows) {
    if (archived) continue;
    const home = db.select({ l: itemHomes.locationId }).from(itemHomes).where(eq(itemHomes.itemId, s.itemId)).get()?.l;
    if (!home) {
      result.left.push({ itemId: s.itemId, name, reason: "has no home yet" });
      continue;
    }
    if (s.qty === 0) {
      // Used up: nothing to carry back, just drop the empty row from the kit.
      db.delete(stock).where(and(eq(stock.itemId, s.itemId), eq(stock.locationId, id))).run();
      continue;
    }
    moveStock(db, { itemId: s.itemId, fromLocationId: id, toLocationId: home });
    result.returned++;
  }

  const unitRows = db
    .select({ u: units, name: items.name, archived: items.archived })
    .from(units)
    .innerJoin(items, eq(items.id, units.itemId))
    .where(and(eq(units.locationId, id), ne(units.status, "retired"), ...(only ? [eq(units.itemId, only)] : [])))
    .all();
  for (const { u, name, archived } of unitRows) {
    if (archived) continue;
    const home = u.homeLocationId ?? db.select({ l: itemHomes.locationId }).from(itemHomes).where(eq(itemHomes.itemId, u.itemId)).get()?.l;
    if (!home) {
      result.left.push({ itemId: u.itemId, name, reason: `${u.code ?? "a unit"} has no home yet` });
      continue;
    }
    if (u.status === "checked_out") checkInUnit(db, u.id, { locationId: home });
    else moveUnit(db, u.id, home);
    result.returned++;
  }

  if (opts.finish && !only) {
    const kit = getLocation(db, id);
    if (kit.items.length === 0 && kit.children.length === 0) {
      archiveLocation(db, id);
      result.finished = true;
    }
  }
  return result;
}
