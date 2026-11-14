import { and, eq, ne } from "drizzle-orm";
import type { Db } from "./db/client";
import { categories, events, itemHomes, items, photos, pins, stock, units, type UndoData } from "./db/schema";
import { ApiError } from "./errors";
import { indexItem } from "./items";

// "You already have this" (DEC-075): a part captured again is added to the one already on record.
// Everything the new entry has goes to the old one (its counts added in, its stickered units, its
// photos, its homes) and the new entry is deleted. One event on the part that stays, undoable
// like any stock change: Undo puts every row back and brings the new entry back.

export function mergeItem(db: Db, sourceId: number, intoId: number): { eventId: number; itemId: number } {
  const get = (id: number) => db.select().from(items).where(eq(items.id, id)).get();
  const source = get(sourceId);
  const into = get(intoId);
  if (!source || source.archived) throw new ApiError(404, "NOT_FOUND", `No item ${sourceId}`);
  if (!into || into.archived) throw new ApiError(404, "NOT_FOUND", `No item ${intoId}`);
  if (sourceId === intoId) throw new ApiError(400, "VALIDATION", "That's the same part");
  const template = into.categoryId ? (db.select({ f: categories.fieldDefs }).from(categories).where(eq(categories.id, into.categoryId)).get()?.f ?? []) : [];
  const perUnit = new Set(template.filter((f) => f.perUnit).map((f) => f.key));

  const eventId = db.transaction(() => {
    const undo: UndoData = { stock: [], homes: db.select().from(itemHomes).where(eq(itemHomes.itemId, intoId)).all().map((h) => h.locationId), merge: { sourceId, units: [], photos: [] } };
    let added = 0;
    for (const s of db.select().from(stock).where(eq(stock.itemId, sourceId)).all()) {
      const t = db.select().from(stock).where(and(eq(stock.itemId, intoId), eq(stock.locationId, s.locationId))).get() ?? null;
      undo.stock!.push({ itemId: sourceId, locationId: s.locationId, row: s }, { itemId: intoId, locationId: s.locationId, row: t });
      db.delete(stock).where(and(eq(stock.itemId, sourceId), eq(stock.locationId, s.locationId))).run();
      if (into.tracking === "exact") {
        // A count is added in; an amount kept as plenty/low/out has no number to add.
        const more = source.tracking === "exact" ? s.qty : null;
        added += more ?? 0;
        if (t) {
          if (more !== null) db.update(stock).set({ qty: (t.qty ?? 0) + more }).where(and(eq(stock.itemId, intoId), eq(stock.locationId, s.locationId))).run();
        } else db.insert(stock).values({ itemId: intoId, locationId: s.locationId, qty: more }).run();
      } else if (!t) {
        const level = source.tracking === "level" ? (s.level ?? "plenty") : s.qty === 0 ? "out" : "plenty";
        db.insert(stock).values({ itemId: intoId, locationId: s.locationId, level }).run();
      }
    }
    for (const u of db.select().from(units).where(and(eq(units.itemId, sourceId), ne(units.status, "retired"))).all()) {
      undo.merge!.units.push({ id: u.id, attributes: u.attributes ?? {} });
      // A unit's own values stay only under fields the part it joins has.
      db.update(units).set({ itemId: intoId, attributes: Object.fromEntries(Object.entries(u.attributes ?? {}).filter(([k]) => perUnit.has(k))) }).where(eq(units.id, u.id)).run();
      added += 1;
    }
    const hasPhoto = !!db.select({ id: photos.id }).from(photos).where(eq(photos.itemId, intoId)).get();
    for (const p of db.select().from(photos).where(eq(photos.itemId, sourceId)).all()) {
      undo.merge!.photos.push({ id: p.id, isMain: p.isMain });
      db.update(photos).set({ itemId: intoId, ...(hasPhoto ? { isMain: false } : {}) }).where(eq(photos.id, p.id)).run();
    }
    for (const h of db.select().from(itemHomes).where(eq(itemHomes.itemId, sourceId)).all()) {
      if (!undo.homes!.includes(h.locationId)) db.insert(itemHomes).values({ itemId: intoId, locationId: h.locationId }).run();
    }
    db.update(items).set({ archived: true }).where(eq(items.id, sourceId)).run();
    db.delete(pins).where(eq(pins.itemId, sourceId)).run();
    return db.insert(events).values({ type: "merge", itemId: intoId, delta: added || null, undoData: undo }).returning({ id: events.id }).get().id;
  });
  indexItem(db, sourceId);
  indexItem(db, intoId);
  return { eventId, itemId: intoId };
}
