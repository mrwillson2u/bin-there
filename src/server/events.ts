import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, itemHomes, items, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { locationPath } from "./locations";
import type { EventView } from "../shared/api";

export function listEvents(db: Db, opts: { itemId?: number; locationId?: number; limit?: number }): EventView[] {
  const conds = [ne(events.type, "undo")];
  if (opts.itemId) conds.push(eq(events.itemId, opts.itemId));
  if (opts.locationId) {
    const l = opts.locationId;
    conds.push(or(eq(events.locationId, l), eq(events.fromLocationId, l), eq(events.toLocationId, l))!);
  }
  const rows = db
    .select({ e: events, itemName: items.name })
    .from(events)
    .leftJoin(items, eq(items.id, events.itemId))
    .where(and(...conds))
    .orderBy(desc(events.id))
    .limit(opts.limit ?? 100)
    .all();

  const latest = latestUndoable(db, [...new Set(rows.map((r) => r.e.itemId).filter((x): x is number => x !== null))]);
  const names = new Map<number, string>();
  const pathName = (id: number | null) => {
    if (id === null) return null;
    if (!names.has(id)) names.set(id, locationPath(db, id).map((c) => c.name).join(" › "));
    return names.get(id)!;
  };

  return rows.map(({ e, itemName }) => ({
    id: e.id,
    at: e.at,
    type: e.type,
    itemId: e.itemId,
    itemName,
    location: pathName(e.locationId),
    from: pathName(e.fromLocationId),
    to: pathName(e.toLocationId),
    delta: e.delta,
    levelAfter: e.levelAfter,
    undone: e.undoneBy !== null,
    canUndo: e.undoData !== null && e.undoneBy === null && e.itemId !== null && latest.get(e.itemId) === e.id,
  }));
}

/** Only an item's most recent change can be undone, so undo never clobbers a later change. */
function latestUndoable(db: Db, itemIds: number[]) {
  if (itemIds.length === 0) return new Map<number, number>();
  const rows = db
    .select({ itemId: events.itemId, id: sql<number>`max(${events.id})` })
    .from(events)
    .where(and(inArray(events.itemId, itemIds), isNull(events.undoneBy), ne(events.type, "undo")))
    .groupBy(events.itemId)
    .all();
  return new Map(rows.map((r) => [r.itemId!, r.id]));
}

export function undoEvent(db: Db, id: number): { itemId: number } {
  const ev = db.select().from(events).where(eq(events.id, id)).get();
  if (!ev) throw new ApiError(404, "NOT_FOUND", `No event ${id}`);
  if (ev.undoneBy !== null) throw new ApiError(409, "CONFLICT", "Already undone");
  if (!ev.undoData || ev.itemId === null) throw new ApiError(400, "VALIDATION", "This change can't be undone");
  if (latestUndoable(db, [ev.itemId]).get(ev.itemId) !== ev.id) {
    throw new ApiError(409, "CONFLICT", "This item changed again since. Undo the newer change first");
  }
  const itemId = ev.itemId;
  const data = ev.undoData;
  db.transaction(() => {
    for (const s of data.stock ?? []) {
      db.delete(stock).where(and(eq(stock.itemId, s.itemId), eq(stock.locationId, s.locationId))).run();
      if (s.row) db.insert(stock).values(s.row).run();
    }
    for (const u of data.units ?? []) {
      db.update(units).set({ locationId: u.locationId }).where(eq(units.id, u.id)).run();
    }
    if (data.homes) {
      db.delete(itemHomes).where(eq(itemHomes.itemId, itemId)).run();
      for (const l of data.homes) db.insert(itemHomes).values({ itemId, locationId: l }).run();
    }
    const undo = db.insert(events).values({ type: "undo", itemId }).returning({ id: events.id }).get();
    db.update(events).set({ undoneBy: undo.id }).where(eq(events.id, id)).run();
  });
  return { itemId };
}
