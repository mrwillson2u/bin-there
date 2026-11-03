import { and, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { itemHomes, items, stock, units } from "./db/schema";
import { ApiError } from "./errors";
import { requireLocation } from "./items";
import { adjustStock, moveUnit, recountStock } from "./stock";
import type { PutBack } from "../shared/api";

// Put-back mode (PRD F6): "this is going back into that location".
// The put-back bin itself is physical only (DEC-009): whatever was used was already
// taken off with −, so putting leftovers back simply adds them.

export function putBack(db: Db, input: PutBack): number | null {
  const item = db.select().from(items).where(eq(items.id, input.itemId)).get();
  if (!item || item.archived) throw new ApiError(404, "NOT_FOUND", `No item ${input.itemId}`);
  requireLocation(db, input.locationId);
  const dest = input.locationId;

  let eventId: number | null;
  if (input.unitId) {
    const unit = db.select().from(units).where(eq(units.id, input.unitId)).get();
    if (!unit || unit.itemId !== item.id) throw new ApiError(400, "VALIDATION", "That sticker isn't on this item");
    if (unit.locationId === dest) throw new ApiError(400, "VALIDATION", "Already there");
    eventId = moveUnit(db, unit.id, dest).eventId;
  } else {
    const atDest = db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, dest))).get();
    if (item.tracking === "level") {
      // Levels don't change by one; just make sure it's recorded there.
      eventId = atDest ? null : recountStock(db, { itemId: item.id, locationId: dest, level: "plenty" });
    } else if (atDest && atDest.qty === null) {
      eventId = null; // Not counted at that location yet; nothing to add to.
    } else {
      eventId = adjustStock(db, { itemId: item.id, locationId: dest, delta: input.qty ?? 1 });
    }
  }

  // The first place something is put back becomes its home.
  const hasHome = db.select().from(itemHomes).where(eq(itemHomes.itemId, item.id)).get();
  if (!hasHome) db.insert(itemHomes).values({ itemId: item.id, locationId: dest }).run();
  return eventId;
}
