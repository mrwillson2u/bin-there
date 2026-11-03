import { desc, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { items, locations, pins } from "./db/schema";
import { ApiError } from "./errors";
import { searchItemsByIds } from "./items";
import { listLocationsByIds } from "./locations";
import type { Pins } from "../shared/api";

// Pinned parts and containers (F11): newest pin first.

export function listPins(db: Db): Pins {
  const rows = db.select().from(pins).orderBy(desc(pins.id)).all();
  return {
    items: searchItemsByIds(db, rows.map((r) => r.itemId).filter((x): x is number => x !== null)),
    locations: listLocationsByIds(db, rows.map((r) => r.locationId).filter((x): x is number => x !== null)),
  };
}

export const isPinned = (db: Db, kind: "item" | "location", id: number) =>
  !!db.select({ id: pins.id }).from(pins).where(eq(kind === "item" ? pins.itemId : pins.locationId, id)).get();

export function setPinned(db: Db, kind: "item" | "location", id: number, pinned: boolean) {
  const table = kind === "item" ? items : locations;
  const exists = db.select({ id: table.id, archived: table.archived }).from(table).where(eq(table.id, id)).get();
  if (!exists || exists.archived) throw new ApiError(404, "NOT_FOUND", `No ${kind} ${id}`);
  const col = kind === "item" ? pins.itemId : pins.locationId;
  if (!pinned) db.delete(pins).where(eq(col, id)).run();
  else if (!isPinned(db, kind, id)) db.insert(pins).values(kind === "item" ? { itemId: id } : { locationId: id }).run();
}

