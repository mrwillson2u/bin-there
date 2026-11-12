import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { items } from "./db/schema";
import { ApiError } from "./errors";
import { archiveItem, updateItem } from "./items";
import { moveEverything } from "./stock";
import type { BulkItems, BulkResult } from "../shared/api";

/**
 * Bulk editing (DEC-057): one change applied to each checked part in turn, each in its own
 * transaction with its own activity entry, so Undo works part by part and one part that can't
 * take the change doesn't stop the others. The answer says how many took it and which didn't.
 */
export function bulkItems(db: Db, input: BulkItems): BulkResult {
  const result: BulkResult = { done: 0, failed: [] };
  for (const id of new Set(input.ids)) {
    try {
      switch (input.action.type) {
        case "category":
          updateItem(db, id, { categoryId: input.action.categoryId });
          break;
        case "tracking":
          updateItem(db, id, { tracking: input.action.tracking });
          break;
        case "move":
          moveEverything(db, id, input.action.locationId);
          break;
        case "delete":
          archiveItem(db, id);
          break;
      }
      result.done++;
    } catch (e) {
      const name = db.select({ name: items.name }).from(items).where(eq(items.id, id)).get()?.name ?? null;
      result.failed.push({ id, name, message: e instanceof ApiError ? e.message : String(e) });
    }
  }
  return result;
}
