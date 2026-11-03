import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, itemHomes, items, photos, pins, stock, units } from "./db/schema";

// Deleting an item only hides it (DEC-013) so it can be undone. Once a deletion is
// well past undo age, this removes the item for good: its photo files, stock, units,
// history and the row itself. Runs nightly and on start.

export const PURGE_AFTER_DAYS = 30;

/** Permanently remove items deleted more than `days` ago. Returns how many were purged. */
export async function purgeOldDeletions(db: Db, photoDir: string, days = PURGE_AFTER_DAYS): Promise<number> {
  const old = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.archived, true), sql`${items.updatedAt} < datetime('now', ${`-${days} days`})`))
    .all()
    .map((r) => r.id);
  if (old.length === 0) return 0;

  const files = db
    .select({ path: photos.path, thumbPath: photos.thumbPath })
    .from(photos)
    .where(inArray(photos.itemId, old))
    .all()
    .flatMap((p) => [p.path, p.thumbPath])
    .filter((f): f is string => !!f);

  db.transaction(() => {
    db.delete(events).where(inArray(events.itemId, old)).run();
    db.delete(photos).where(inArray(photos.itemId, old)).run();
    db.delete(pins).where(inArray(pins.itemId, old)).run();
    db.delete(stock).where(inArray(stock.itemId, old)).run();
    db.delete(itemHomes).where(inArray(itemHomes.itemId, old)).run();
    db.delete(units).where(inArray(units.itemId, old)).run();
    for (const id of old) db.run(sql`delete from items_fts where rowid = ${id}`);
    db.delete(items).where(inArray(items.id, old)).run();
  });
  // Files go after the rows: a missing file is harmless, an orphaned row would not be.
  for (const f of files) await rm(join(photoDir, f), { force: true });
  return old.length;
}

/** Purge once a day at `hour`, and shortly after start. */
export function scheduleHousekeeping(db: Db, photoDir: string, msUntil: (hour: number) => number, hour: number, log = console.log) {
  const run = () =>
    purgeOldDeletions(db, photoDir).then(
      (n) => n > 0 && log(`housekeeping: purged ${n} old deletion${n === 1 ? "" : "s"}`),
      (e: Error) => log(`housekeeping FAILED: ${e.message}`),
    );
  const loop = () => setTimeout(() => run().finally(loop), msUntil(hour)).unref();
  setTimeout(run, 30_000).unref();
  loop();
}
