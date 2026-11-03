import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, itemHomes, items, locations, stock, units, type UndoData } from "./db/schema";
import { ApiError } from "./errors";
import { indexItem, requireLocation } from "./items";
import type { Adjust, MoveStock, Recount } from "../shared/api";

// Every action here writes one event in the same transaction, with a snapshot of
// the rows it touched so the event can be undone (see events.ts).

function requireItem(db: Db, id: number) {
  const item = db.select().from(items).where(eq(items.id, id)).get();
  if (!item || item.archived) throw new ApiError(404, "NOT_FOUND", `No item ${id}`);
  return item;
}

const stockRow = (db: Db, itemId: number, locationId: number) =>
  db.select().from(stock).where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId))).get() ?? null;

const homesOf = (db: Db, itemId: number) =>
  db.select({ l: itemHomes.locationId }).from(itemHomes).where(eq(itemHomes.itemId, itemId)).all().map((h) => h.l);

const whereRow = (itemId: number, locationId: number) => and(eq(stock.itemId, itemId), eq(stock.locationId, locationId));
const now = sql`(datetime('now'))`;

function record(db: Db, values: typeof events.$inferInsert): number {
  db.update(items).set({ updatedAt: now }).where(eq(items.id, values.itemId!)).run();
  return db.insert(events).values(values).returning({ id: events.id }).get().id;
}

/** +/− for exact items, plenty/low/out for level items. Returns the event id, or null if nothing changed. */
export function adjustStock(db: Db, input: Adjust): number | null {
  const item = requireItem(db, input.itemId);
  requireLocation(db, input.locationId);
  const { itemId, locationId } = input;
  const before = stockRow(db, itemId, locationId);
  const undoData: UndoData = { stock: [{ itemId, locationId, row: before }] };

  if ("delta" in input) {
    if (item.tracking !== "exact") throw new ApiError(400, "VALIDATION", "This item is tracked as plenty/low/out");
    if (!before && input.delta < 0) throw new ApiError(400, "VALIDATION", "None recorded at this location");
    if (before && before.qty === null) throw new ApiError(400, "VALIDATION", "Not counted yet: enter a count first");
    const current = before?.qty ?? 0;
    const next = Math.max(0, current + input.delta);
    const delta = next - current;
    if (delta === 0) return null;
    return db.transaction(() => {
      if (before) {
        db.update(stock).set({ qty: next, changesSinceCount: sql`${stock.changesSinceCount} + 1` }).where(whereRow(itemId, locationId)).run();
      } else {
        db.insert(stock).values({ itemId, locationId, qty: next }).run();
      }
      return record(db, { type: delta > 0 ? "add" : "use", itemId, locationId, delta, undoData });
    });
  }

  if (item.tracking !== "level") throw new ApiError(400, "VALIDATION", "This item is tracked by exact count");
  if (before?.level === input.level) return null;
  return db.transaction(() => {
    if (before) {
      db.update(stock).set({ level: input.level, lastCountedAt: now, changesSinceCount: 0 }).where(whereRow(itemId, locationId)).run();
    } else {
      db.insert(stock).values({ itemId, locationId, level: input.level }).run();
    }
    return record(db, { type: "adjust", itemId, locationId, levelAfter: input.level, undoData });
  });
}

/** Set the count and reset staleness. On a new location this adds the item there. */
export function recountStock(db: Db, input: Recount): number {
  const item = requireItem(db, input.itemId);
  requireLocation(db, input.locationId);
  const { itemId, locationId } = input;
  const before = stockRow(db, itemId, locationId);
  const homes = homesOf(db, itemId);
  const qty = item.tracking === "exact" ? (input.qty ?? null) : null;
  const level = item.tracking === "level" ? (input.level ?? before?.level ?? "plenty") : null;
  return db.transaction(() => {
    if (before) {
      db.update(stock).set({ qty, level, lastCountedAt: now, changesSinceCount: 0 }).where(whereRow(itemId, locationId)).run();
    } else {
      db.insert(stock).values({ itemId, locationId, qty, level }).run();
      if (homes.length === 0) db.insert(itemHomes).values({ itemId, locationId }).run();
    }
    const delta = qty !== null ? qty - (before?.qty ?? 0) : null;
    return record(db, {
      type: before ? "recount" : "add",
      itemId,
      locationId,
      delta,
      levelAfter: level,
      undoData: { stock: [{ itemId, locationId, row: before }], homes },
    });
  });
}

/** Move some (exact) or all of an item's stock. Moving everything out of a home moves the home too. */
export function moveStock(db: Db, input: MoveStock): number {
  const item = requireItem(db, input.itemId);
  const { itemId, fromLocationId: from, toLocationId: to } = input;
  if (from === to) throw new ApiError(400, "VALIDATION", "It's already there");
  requireLocation(db, to);
  const fromRow = stockRow(db, itemId, from);
  if (!fromRow) throw new ApiError(400, "VALIDATION", "None recorded at that location");
  const toRow = stockRow(db, itemId, to);
  const homes = homesOf(db, itemId);

  const exact = item.tracking === "exact";
  const amount = exact && fromRow.qty !== null ? (input.qty ?? fromRow.qty) : null;
  if (amount !== null && amount > fromRow.qty!) throw new ApiError(400, "VALIDATION", `Only ${fromRow.qty} there`);
  if (amount === 0) throw new ApiError(400, "VALIDATION", "Nothing to move");
  const movesAll = amount === null || amount === fromRow.qty;

  return db.transaction(() => {
    if (movesAll) db.delete(stock).where(whereRow(itemId, from)).run();
    else db.update(stock).set({ qty: fromRow.qty! - amount!, changesSinceCount: sql`${stock.changesSinceCount} + 1` }).where(whereRow(itemId, from)).run();

    if (toRow) {
      const set = exact
        ? { qty: amount === null ? toRow.qty : (toRow.qty ?? 0) + amount, changesSinceCount: toRow.changesSinceCount + 1 }
        : { level: fromRow.level };
      db.update(stock).set(set).where(whereRow(itemId, to)).run();
    } else {
      db.insert(stock)
        .values({ itemId, locationId: to, qty: exact ? amount : null, level: exact ? null : fromRow.level, lastCountedAt: fromRow.lastCountedAt })
        .run();
    }

    if (movesAll && homes.includes(from)) {
      db.delete(itemHomes).where(and(eq(itemHomes.itemId, itemId), eq(itemHomes.locationId, from))).run();
      if (!homes.includes(to)) db.insert(itemHomes).values({ itemId, locationId: to }).run();
    }

    return record(db, {
      type: "move",
      itemId,
      fromLocationId: from,
      toLocationId: to,
      delta: amount,
      undoData: {
        stock: [
          { itemId, locationId: from, row: fromRow },
          { itemId, locationId: to, row: toRow },
        ],
        homes,
      },
    });
  });
}

export function createUnit(db: Db, input: { itemId: number; code: string; locationId?: number | null; label?: string | null }): number {
  requireItem(db, input.itemId);
  if (input.locationId) requireLocation(db, input.locationId);
  const taken =
    db.select({ id: locations.id }).from(locations).where(eq(locations.code, input.code)).get() ??
    db.select({ id: units.id }).from(units).where(eq(units.code, input.code)).get();
  if (taken) throw new ApiError(409, "CONFLICT", `Sticker ${input.code} is already assigned`);
  const id = db.transaction(() => {
    const unit = db
      .insert(units)
      .values({ itemId: input.itemId, code: input.code, label: input.label ?? null, locationId: input.locationId ?? null, homeLocationId: input.locationId ?? null })
      .returning({ id: units.id })
      .get();
    record(db, { type: "add", itemId: input.itemId, unitId: unit.id, locationId: input.locationId ?? null, delta: 1 });
    return unit.id;
  });
  indexItem(db, input.itemId);
  return id;
}

export function moveUnit(db: Db, unitId: number, toLocationId: number): { eventId: number; itemId: number } {
  const unit = db.select().from(units).where(eq(units.id, unitId)).get();
  if (!unit) throw new ApiError(404, "NOT_FOUND", `No unit ${unitId}`);
  requireLocation(db, toLocationId);
  if (unit.locationId === toLocationId) throw new ApiError(400, "VALIDATION", "It's already there");
  const eventId = db.transaction(() => {
    db.update(units).set({ locationId: toLocationId, updatedAt: now }).where(eq(units.id, unitId)).run();
    return record(db, {
      type: "move",
      itemId: unit.itemId,
      unitId,
      fromLocationId: unit.locationId,
      toLocationId,
      delta: 1,
      undoData: { units: [{ id: unitId, locationId: unit.locationId }] },
    });
  });
  return { eventId, itemId: unit.itemId };
}

// ── Check out / check in (F10): stickered returnables ──────────────────────────

function requireUnit(db: Db, id: number) {
  const unit = db.select().from(units).where(eq(units.id, id)).get();
  if (!unit) throw new ApiError(404, "NOT_FOUND", `No unit ${id}`);
  return unit;
}

const unitSnapshot = (u: typeof units.$inferSelect) => ({
  id: u.id,
  locationId: u.locationId,
  out: { status: u.status, checkedOutAt: u.checkedOutAt, checkedOutNote: u.checkedOutNote },
});

/** Take a unit out to a location (bench, project) and/or with a note ("lent to Sam"). */
export function checkOutUnit(db: Db, unitId: number, input: { toLocationId?: number | null; note?: string | null }) {
  const unit = requireUnit(db, unitId);
  if (unit.status === "checked_out") throw new ApiError(409, "CONFLICT", "Already checked out");
  if (input.toLocationId) requireLocation(db, input.toLocationId);
  if (!input.toLocationId && !input.note) throw new ApiError(400, "VALIDATION", "Say where it's going or add a note");
  const eventId = db.transaction(() => {
    db.update(units)
      .set({
        status: "checked_out",
        locationId: input.toLocationId ?? null,
        checkedOutAt: now,
        checkedOutNote: input.note ?? null,
        updatedAt: now,
      })
      .where(eq(units.id, unitId))
      .run();
    return record(db, {
      type: "check_out",
      itemId: unit.itemId,
      unitId,
      fromLocationId: unit.locationId,
      toLocationId: input.toLocationId ?? null,
      delta: 1,
      undoData: { units: [unitSnapshot(unit)] },
    });
  });
  return { eventId, itemId: unit.itemId };
}

/** Bring a unit back: to its home unless told otherwise. */
export function checkInUnit(db: Db, unitId: number, input: { locationId?: number | null } = {}) {
  const unit = requireUnit(db, unitId);
  const dest = input.locationId ?? unit.homeLocationId;
  if (!dest) throw new ApiError(400, "VALIDATION", "It has no home yet: say where it's going");
  requireLocation(db, dest);
  const eventId = db.transaction(() => {
    db.update(units)
      .set({ status: "home", locationId: dest, checkedOutAt: null, checkedOutNote: null, updatedAt: now })
      .where(eq(units.id, unitId))
      .run();
    return record(db, {
      type: "check_in",
      itemId: unit.itemId,
      unitId,
      fromLocationId: unit.locationId,
      toLocationId: dest,
      delta: 1,
      undoData: { units: [unitSnapshot(unit)] },
    });
  });
  return { eventId, itemId: unit.itemId };
}
