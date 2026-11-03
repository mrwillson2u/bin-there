import { and, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { itemHomes, items, locations, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { requireLocation } from "./items";
import { adjustStock, moveStock, moveUnit, recountStock } from "./stock";
import type { PutBack } from "../shared/api";

// Put-back mode (PRD F6): "this is going back into that location".
// If the item was recorded in the put-back bin, it's moved out of there;
// otherwise it's simply added at the destination.

export function putBack(db: Db, input: PutBack): number | null {
  const item = db.select().from(items).where(eq(items.id, input.itemId)).get();
  if (!item || item.archived) throw new ApiError(404, "NOT_FOUND", `No item ${input.itemId}`);
  requireLocation(db, input.locationId);
  const dest = input.locationId;
  const qty = input.qty ?? 1;

  let eventId: number | null;
  if (input.unitId) {
    const unit = db.select().from(units).where(eq(units.id, input.unitId)).get();
    if (!unit || unit.itemId !== item.id) throw new ApiError(400, "VALIDATION", "That sticker isn't on this item");
    if (unit.locationId === dest) throw new ApiError(400, "VALIDATION", "Already there");
    eventId = moveUnit(db, unit.id, dest).eventId;
  } else {
    const bin = db.select({ id: locations.id }).from(locations).where(eq(locations.type, "put_back")).get();
    const row = (locationId: number) =>
      db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId))).get();
    const inBin = bin && bin.id !== dest ? row(bin.id) : undefined;
    const atDest = row(dest);

    if (item.tracking === "level") {
      if (inBin) eventId = moveStock(db, { itemId: item.id, fromLocationId: bin!.id, toLocationId: dest });
      else if (!atDest) eventId = recountStock(db, { itemId: item.id, locationId: dest, level: "plenty" });
      else eventId = null; // Already recorded there; levels don't change by one.
    } else if (inBin && inBin.qty !== null && inBin.qty > 0) {
      eventId = moveStock(db, { itemId: item.id, fromLocationId: bin!.id, toLocationId: dest, qty: Math.min(qty, inBin.qty) });
    } else if (atDest && atDest.qty === null) {
      eventId = null; // Not counted at that location yet; nothing to add to.
    } else {
      eventId = adjustStock(db, { itemId: item.id, locationId: dest, delta: qty });
    }
  }

  // The first place something is put back becomes its home.
  const hasHome = db.select().from(itemHomes).where(eq(itemHomes.itemId, item.id)).get();
  if (!hasHome) db.insert(itemHomes).values({ itemId: item.id, locationId: dest }).run();
  return eventId;
}
