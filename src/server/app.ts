import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { locations, units } from "./db/schema";
import { ApiError, errorResponse, parseBody } from "./errors";
import {
  archiveLocation,
  assignLocationCode,
  createLocation,
  getLocation,
  listLocations,
  placeBin,
  updateLocation,
} from "./locations";
import {
  addPhoto,
  archiveItem,
  countNeedsDetails,
  listCheckedOut,
  listLow,
  listStale,
  recentlyUsed,
  createCategory,
  createItem,
  getItem,
  listCategories,
  searchItems,
  setHomes,
  updateItem,
} from "./items";
import { adjustStock, checkInUnit, checkOutUnit, createUnit, moveStock, moveUnit, recountStock } from "./stock";
import { listEvents, undoEvent } from "./events";
import { putBack } from "./putback";
import { listPins, setPinned } from "./pins";
import { readBackupStatus, runBackup, type BackupConfig } from "./backup";
import {
  adjustSchema,
  assignCodeSchema,
  placeBinSchema,
  codeSchema,
  createCategorySchema,
  createItemSchema,
  createLocationSchema,
  createUnitSchema,
  moveStockSchema,
  moveUnitSchema,
  checkInSchema,
  checkOutSchema,
  putBackSchema,
  recountSchema,
  setHomesSchema,
  updateItemSchema,
  updateLocationSchema,
  type BackupInfo,
  type ScanResult,
  type StockResult,
  type Stats,
} from "../shared/api";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_FILE = /^[\w-]+\.jpg$/;

export function createApi(db: Db, opts: { photoDir: string; backup?: BackupConfig }) {
  mkdirSync(opts.photoDir, { recursive: true });
  const api = new Hono();
  api.onError((err, c) => errorResponse(c, err));

  const intParam = (v: string | undefined) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "VALIDATION", `Bad id ${v}`);
    return n;
  };

  api.get("/health", (c) => c.json({ ok: true }));
  api.get("/stats", (c) =>
    c.json({ needsDetails: countNeedsDetails(db), checkedOut: listCheckedOut(db).length, stale: listStale(db).length, low: listLow(db).length } satisfies Stats),
  );

  api.get("/scan/:code", (c) => {
    const code = parseBody(codeSchema, c.req.param("code"));
    const loc = db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get();
    if (loc) return c.json<ScanResult>({ kind: "location", location: getLocation(db, loc.id) });
    const unit = db.select({ id: units.id, itemId: units.itemId }).from(units).where(eq(units.code, code)).get();
    if (unit) return c.json<ScanResult>({ kind: "unit", unitId: unit.id, itemId: unit.itemId });
    return c.json<ScanResult>({ kind: "unassigned", code });
  });

  // ── Locations ──
  api.get("/locations", (c) => {
    const parent = c.req.query("parent");
    return c.json(listLocations(db, parent ? Number(parent) : null));
  });
  api.get("/locations/:id", (c) => c.json(getLocation(db, intParam(c.req.param("id")))));
  api.post("/locations", async (c) => {
    const input = parseBody(createLocationSchema, await c.req.json());
    return c.json(createLocation(db, input), 201);
  });
  api.patch("/locations/:id", async (c) => {
    const input = parseBody(updateLocationSchema, await c.req.json());
    return c.json(updateLocation(db, intParam(c.req.param("id")), input));
  });
  api.delete("/locations/:id", (c) => c.json(archiveLocation(db, intParam(c.req.param("id")))));
  api.post("/locations/:id/code", async (c) => {
    const { code } = parseBody(assignCodeSchema, await c.req.json());
    return c.json(assignLocationCode(db, intParam(c.req.param("id")), code));
  });
  api.put("/locations/:id/slot", async (c) => {
    const slot = parseBody(placeBinSchema, await c.req.json());
    return c.json(placeBin(db, intParam(c.req.param("id")), slot && { x: slot.x, y: slot.y, rotated: slot.rotated ?? false }));
  });

  // ── Items ──
  api.get("/items", (c) =>
    c.json(searchItems(db, { q: c.req.query("q"), needsDetails: c.req.query("needs") === "1" })),
  );
  api.get("/items/recently-used", (c) => c.json(recentlyUsed(db, Number(c.req.query("days") ?? 30) || 30)));
  api.get("/items/low", (c) => c.json(listLow(db)));
  api.get("/review", (c) => c.json(listStale(db)));
  api.get("/items/:id", (c) => c.json(getItem(db, intParam(c.req.param("id")))));
  api.post("/items", async (c) => {
    const input = parseBody(createItemSchema, await c.req.json());
    return c.json(createItem(db, input), 201);
  });
  api.patch("/items/:id", async (c) => {
    const input = parseBody(updateItemSchema, await c.req.json());
    return c.json(updateItem(db, intParam(c.req.param("id")), input));
  });
  api.delete("/items/:id", (c) => c.json(archiveItem(db, intParam(c.req.param("id")))));
  api.put("/items/:id/homes", async (c) => {
    const { locationIds } = parseBody(setHomesSchema, await c.req.json());
    return c.json(setHomes(db, intParam(c.req.param("id")), locationIds));
  });

  // Photos are resized on the phone before upload (photo + thumbnail), so the server just stores them.
  api.post("/items/:id/photos", async (c) => {
    const itemId = intParam(c.req.param("id"));
    getItem(db, itemId);
    const body = await c.req.parseBody();
    const files = [body.photo, body.thumb];
    if (!files.every((f): f is File => f instanceof File)) {
      throw new ApiError(400, "VALIDATION", "Expected photo and thumb files");
    }
    if (files.some((f) => f.size > MAX_PHOTO_BYTES || !f.type.startsWith("image/"))) {
      throw new ApiError(400, "VALIDATION", "Photo must be an image under 10 MB");
    }
    const base = `${itemId}-${randomUUID().slice(0, 8)}`;
    const [photo, thumb] = [`${base}.jpg`, `${base}-thumb.jpg`];
    await writeFile(join(opts.photoDir, photo), Buffer.from(await files[0]!.arrayBuffer()));
    await writeFile(join(opts.photoDir, thumb), Buffer.from(await files[1]!.arrayBuffer()));
    return c.json(addPhoto(db, itemId, photo, thumb), 201);
  });
  api.get("/photos/:file", async (c) => {
    const file = c.req.param("file");
    if (!PHOTO_FILE.test(file)) throw new ApiError(404, "NOT_FOUND", "No such photo");
    const data = await readFile(join(opts.photoDir, file)).catch(() => {
      throw new ApiError(404, "NOT_FOUND", "No such photo");
    });
    return c.body(data, 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" });
  });

  // ── Stock actions: each returns the event id (for Undo) and the updated item ──
  const result = (eventId: number | null, itemId: number): StockResult => ({ eventId, item: getItem(db, itemId) });
  api.post("/stock/adjust", async (c) => {
    const input = parseBody(adjustSchema, await c.req.json());
    return c.json(result(adjustStock(db, input), input.itemId));
  });
  api.post("/stock/recount", async (c) => {
    const input = parseBody(recountSchema, await c.req.json());
    return c.json(result(recountStock(db, input), input.itemId));
  });
  api.post("/stock/move", async (c) => {
    const input = parseBody(moveStockSchema, await c.req.json());
    return c.json(result(moveStock(db, input), input.itemId));
  });

  api.post("/putback", async (c) => {
    const input = parseBody(putBackSchema, await c.req.json());
    return c.json(result(putBack(db, input), input.itemId));
  });

  // ── Units (stickered returnables) ──
  api.post("/units", async (c) => {
    const input = parseBody(createUnitSchema, await c.req.json());
    return c.json(result(createUnit(db, input), input.itemId), 201);
  });
  api.get("/units/checked-out", (c) => c.json(listCheckedOut(db)));
  api.post("/units/:id/checkout", async (c) => {
    const input = parseBody(checkOutSchema, await c.req.json());
    const { eventId, itemId } = checkOutUnit(db, intParam(c.req.param("id")), input);
    return c.json(result(eventId, itemId));
  });
  api.post("/units/:id/checkin", async (c) => {
    const input = parseBody(checkInSchema, await c.req.json().catch(() => ({})));
    const { eventId, itemId } = checkInUnit(db, intParam(c.req.param("id")), input);
    return c.json(result(eventId, itemId));
  });
  api.post("/units/:id/move", async (c) => {
    const { toLocationId } = parseBody(moveUnitSchema, await c.req.json());
    const { eventId, itemId } = moveUnit(db, intParam(c.req.param("id")), toLocationId);
    return c.json(result(eventId, itemId));
  });

  // ── Categories ──
  api.get("/categories", (c) => c.json(listCategories(db)));
  api.post("/categories", async (c) => {
    const input = parseBody(createCategorySchema, await c.req.json());
    return c.json(createCategory(db, input), 201);
  });

  // ── Activity log ──
  api.get("/events", (c) => {
    const item = c.req.query("item");
    const location = c.req.query("location");
    return c.json(
      listEvents(db, {
        itemId: item ? intParam(item) : undefined,
        locationId: location ? intParam(location) : undefined,
        limit: Math.min(Number(c.req.query("limit") ?? 100) || 100, 500),
      }),
    );
  });
  api.post("/events/:id/undo", (c) => {
    const { itemId } = undoEvent(db, intParam(c.req.param("id")));
    return c.json(getItem(db, itemId));
  });

  // ── Pins (F11) ──
  api.get("/pins", (c) => c.json(listPins(db)));
  for (const kind of ["item", "location"] as const) {
    api.put(`/pins/${kind}/:id`, (c) => {
      setPinned(db, kind, intParam(c.req.param("id")), true);
      return c.json(listPins(db));
    });
    api.delete(`/pins/${kind}/:id`, (c) => {
      setPinned(db, kind, intParam(c.req.param("id")), false);
      return c.json(listPins(db));
    });
  }

  // ── Backups ──
  api.get("/backup", async (c) =>
    c.json<BackupInfo>({ enabled: !!opts.backup, last: opts.backup ? await readBackupStatus(opts.backup) : null }),
  );
  api.post("/backup", async (c) => {
    if (!opts.backup) throw new ApiError(400, "VALIDATION", "Backups aren't set up (BACKUP_DIR)");
    const last = await runBackup(db, opts.backup);
    return c.json<BackupInfo>({ enabled: true, last }, last.ok ? 200 : 500);
  });

  // Anything else under /api is a JSON 404, not the web app's index.html.
  api.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: `No API route ${c.req.method} ${c.req.path}` } }, 404));

  return api;
}
