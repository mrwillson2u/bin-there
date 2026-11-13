import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { items, locations, units, type FieldDef } from "./db/schema";
import { ApiError, errorResponse, parseBody } from "./errors";
import {
  archiveLocation,
  assignLocationCode,
  createLocation,
  getLocation,
  listAllLocations,
  listLocations,
  placeBin,
  putBackBin,
  placeInRack,
  setRackLabels,
  setRackSize,
  takeOutBin,
  updateLocation,
} from "./locations";
import {
  addPhoto,
  archiveItem,
  categoryNames,
  categoryUsage,
  categoryValues,
  countNeedsDetails,
  createCategory,
  createItem,
  deleteCategory,
  deletePhoto,
  getItem,
  indexItem,
  listCategories,
  listCheckedOut,
  listInventory,
  listLow,
  listNeedsDetails,
  listStale,
  recentlyUsed,
  requireItemPhoto,
  searchItems,
  setHomes,
  setMainPhoto,
  setPhotoCrop,
  updateCategory,
  updateItem,
} from "./items";
import { mergeFields } from "./fields";
import { adjustStock, checkInUnit, checkOutUnit, createUnit, moveEverything, moveStock, moveUnit, moveUnits, recountStock, retireUnit, updateUnit } from "./stock";
import { listEvents, undoEvent } from "./events";
import { bulkItems } from "./bulk";
import { putBack } from "./putback";
import { listProjects, returnFromProject } from "./projects";
import { listPins, setPinned } from "./pins";
import { readBackupStatus, runBackup, type BackupConfig } from "./backup";
import { Changes } from "./changes";
import { ollamaChat, ollamaHasModel } from "./ai/ollama";
import { pageFetcher, pdfReader, searxng } from "./ai/search";
import { researchItem, type Deps } from "./ai/research";
import { AiQueue } from "./ai/queue";
import { mouserReader } from "./ai/mouser";
import { digikeyReader } from "./ai/digikey";
import {
  adjustSchema,
  assignCodeSchema,
  bulkItemsSchema,
  placeBinSchema,
  returnProjectSchema,
  codeSchema,
  createCategorySchema,
  createItemSchema,
  createLocationSchema,
  createUnitSchema,
  inventoryQuerySchema,
  photoCropSchema,
  moveStockSchema,
  moveUnitSchema,
  mergeFieldsSchema,
  moveUnitsSchema,
  checkInSchema,
  checkOutSchema,
  putBackSchema,
  recountSchema,
  setHomesSchema,
  rackLabelsSchema,
  rackSizeSchema,
  checkCodesSchema,
  rackSlotSchema,
  researchSchema,
  updateCategorySchema,
  takeOutSchema,
  updateItemSchema,
  updateLocationSchema,
  type AiStatus,
  type BackupInfo,
  type CodesCheck,
  type ResearchRequest,
  updateUnitSchema,
  type ResearchResult,
  type StoredResearch,
  type ScanResult,
  type StockResult,
  type Stats,
} from "../shared/api";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_FILE = /^[\w-]+\.jpg$/;

/**
 * AI data fill (DEC-048): off unless AI_URL is set. `fetch` can be swapped for tests. The shop
 * keys (DEC-049) turn on Mouser's and Digi-Key's APIs, the only way those two can be read.
 */
export type AiConfig = {
  url: string;
  model: string;
  searchUrl: string | null;
  /** The search engines to ask (SEARCH_ENGINES, DEC-066); unset, the search service's own. */
  searchEngines?: string | null;
  mouserKey?: string | null;
  digikey?: { clientId: string; clientSecret: string } | null;
  fetch?: typeof fetch;
};

/** A category's fields as the AI gets them: per-unit ones (DEC-062) are each unit's own state, not something a page can tell. */
function aiFieldList(defs: FieldDef[]): { key: string; label: string; options?: string[] }[] {
  return defs.filter((d) => !d.perUnit).map((d) => ({ key: d.key, label: d.label, ...(d.type === "choice" && d.options?.length ? { options: d.options } : {}) }));
}

/** 404 for a part that isn't there, without building its whole detail. */
function requireItemExists(db: Db, id: number) {
  if (!db.select({ id: items.id }).from(items).where(eq(items.id, id)).get()) throw new ApiError(404, "NOT_FOUND", "Item not found");
}

export function createApi(db: Db, opts: { photoDir: string; backup?: BackupConfig; ai?: AiConfig }) {
  mkdirSync(opts.photoDir, { recursive: true });
  const api = new Hono();
  api.onError((err, c) => errorResponse(c, err));

  // Live updates (DEC-046): any write that succeeds bumps the change version, and open screens
  // hear about it on /changes. Backups don't change what a screen shows.
  const changes = new Changes();
  api.use("*", async (c, next) => {
    await next();
    if (c.req.method !== "GET" && c.res.ok && !c.req.path.endsWith("/backup")) changes.bump(c.req.header("x-client") ?? null);
  });

  const intParam = (v: string | undefined) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "VALIDATION", `Bad id ${v}`);
    return n;
  };

  api.get("/health", (c) => c.json({ ok: true }));
  api.get("/changes", (c) => {
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const send = (change: { version: number; by: string | null }) =>
        stream.writeSSE({ event: "change", data: JSON.stringify(change) }).catch(() => {});
      await send({ version: changes.version, by: null });
      const unsubscribe = changes.subscribe(send);
      // A comment every 25 s keeps proxies from closing a quiet stream.
      const keepAlive = setInterval(() => stream.write(": ping\n\n").catch(() => {}), 25_000);
      keepAlive.unref();
      await new Promise<void>((done) => stream.onAbort(done));
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
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

  // Print stickers (DEC-052): the codes are drawn on the device; this only says which are taken.
  api.post("/stickers/check", async (c) => {
    const { codes } = parseBody(checkCodesSchema, await c.req.json());
    const used = new Set<string>();
    for (const code of codes) {
      if (db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get()) used.add(code);
      else if (db.select({ id: units.id }).from(units).where(eq(units.code, code)).get()) used.add(code);
    }
    return c.json<CodesCheck>({ used: [...used] });
  });

  // ── Locations ──
  api.get("/locations", (c) => {
    if (c.req.query("all") === "1") return c.json(listAllLocations(db));
    const parent = c.req.query("parent");
    return c.json(listLocations(db, parent ? Number(parent) : null));
  });
  api.get("/locations/:id", (c) => c.json(getLocation(db, intParam(c.req.param("id")))));
  // Racks and shelves with positions (DEC-034).
  api.put("/locations/:id/rack-size", async (c) => c.json(setRackSize(db, intParam(c.req.param("id")), parseBody(rackSizeSchema, await c.req.json()).size)));
  api.put("/locations/:id/rack-labels", async (c) => c.json(setRackLabels(db, intParam(c.req.param("id")), parseBody(rackLabelsSchema, await c.req.json()).labels)));
  api.put("/locations/:id/rack-slot", async (c) => c.json(placeInRack(db, intParam(c.req.param("id")), parseBody(rackSlotSchema, await c.req.json()).slot)));
  api.post("/locations/:id/take-out", async (c) => {
    const input = parseBody(takeOutSchema, await c.req.json().catch(() => ({})));
    return c.json(takeOutBin(db, intParam(c.req.param("id")), input));
  });
  api.post("/locations/:id/put-back", (c) => c.json(putBackBin(db, intParam(c.req.param("id")))));
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
    const { code, move } = parseBody(assignCodeSchema, await c.req.json());
    return c.json(assignLocationCode(db, intParam(c.req.param("id")), code, { move }));
  });
  api.put("/locations/:id/slot", async (c) => {
    const slot = parseBody(placeBinSchema, await c.req.json());
    return c.json(placeBin(db, intParam(c.req.param("id")), slot && { x: slot.x, y: slot.y, rotated: slot.rotated ?? false }));
  });

  // ── Project kits (DEC-019) ──
  api.get("/projects", (c) => c.json(listProjects(db)));
  api.post("/projects/:id/return", async (c) => {
    const input = parseBody(returnProjectSchema, await c.req.json().catch(() => ({})));
    return c.json(returnFromProject(db, intParam(c.req.param("id")), input));
  });

  // ── Items ──
  api.get("/items", (c) =>
    c.json(searchItems(db, { q: c.req.query("q"), needsDetails: c.req.query("needs") === "1" })),
  );
  api.get("/inventory", (c) => c.json(listInventory(db, parseBody(inventoryQuerySchema, c.req.query()))));
  api.get("/items/recently-used", (c) => c.json(recentlyUsed(db, Number(c.req.query("days") ?? 30) || 30)));
  api.get("/items/low", (c) => c.json(listLow(db)));
  api.get("/items/needs-details", (c) => c.json(listNeedsDetails(db)));
  api.get("/review", (c) => c.json(listStale(db)));
  api.get("/items/:id", (c) => c.json(getItem(db, intParam(c.req.param("id")))));
  api.post("/items/bulk", async (c) => c.json(bulkItems(db, parseBody(bulkItemsSchema, await c.req.json()))));

  // AI data fill (DEC-048): look the part up and suggest details. Writes nothing; the screen
  // offers the suggestions and the accepted ones come back through PATCH with `aiFields`.
  api.get("/ai/status", async (c) => {
    const ai = opts.ai;
    const modelReady = ai ? await ollamaHasModel(ai.url, ai.model, ai.fetch) : false;
    return c.json<AiStatus>({ enabled: !!ai, model: ai?.model ?? null, modelReady, search: !!ai?.searchUrl, shops: { mouser: !!ai?.mouserKey, digikey: !!ai?.digikey } });
  });
  // The pieces of a look-up: the model, the search, the page and shop readers (DEC-048, DEC-049).
  const aiDeps = (ai: AiConfig, model: string, log: (line: string) => void): Omit<Deps, "readPhoto"> => {
    const f = ai.fetch ?? fetch;
    return {
      chat: ollamaChat(ai.url, model, f, log),
      search: ai.searchUrl ? searxng(ai.searchUrl, f, ai.searchEngines) : async () => [],
      fetchPage: pageFetcher(f),
      readPdf: pdfReader(f),
      shops: {
        ...(ai.mouserKey ? { Mouser: mouserReader(ai.mouserKey, f) } : {}),
        ...(ai.digikey ? { "Digi-Key": digikeyReader(ai.digikey.clientId, ai.digikey.clientSecret, f) } : {}),
      },
      log,
    };
  };
  // One look-up, as the route and the queue both run it (DEC-055). `now` is what the form holds.
  const lookUp = async (itemId: number, now: ResearchRequest): Promise<ResearchResult> => {
    const ai = opts.ai;
    if (!ai) throw new ApiError(400, "VALIDATION", "AI isn't set up on this server (AI_URL)");
    const item = getItem(db, itemId);
    const cats = listCategories(db);
    return researchItem(
      {
        name: now.name || item.name,
        url: now.url !== undefined ? now.url || null : item.url,
        categoryName: item.categoryName,
        fields: aiFieldList(item.fieldDefs),
        attributes: item.attributes,
        supplier: now.supplier !== undefined ? now.supplier || null : item.supplier,
        supplierPn: now.supplierPn !== undefined ? now.supplierPn || null : item.supplierPn,
        notes: item.notes,
        // Photo URLs are /api/photos/<file>; the file sits in the photo folder.
        photos: item.photos.map((p) => p.url.slice(p.url.lastIndexOf("/") + 1)),
        categories: cats.map((cat) => cat.name),
        // A part with no category gets the fields of the one the photo puts it in (DEC-064), and
        // the owner's names show the AI how things are named here (DEC-065).
        fieldsByCategory: Object.fromEntries(cats.map((cat) => [cat.name, aiFieldList(cat.fieldDefs)])),
        namesByCategory: categoryNames(db, item.id),
      },
      {
        ...aiDeps(ai, now.model || ai.model, (line) => console.log(`[ai] item ${item.id}: ${line}`)),
        readPhoto: (file) => (PHOTO_FILE.test(file) ? readFile(join(opts.photoDir, file)).then((b) => b.toString("base64")).catch(() => null) : Promise.resolve(null)),
      },
      { quick: now.mode === "quick" },
    );
  };
  // The queue (DEC-055): parts captured with "look it up with AI" are looked up one at a time in
  // the background; its own writes bump the change version so open screens refresh.
  const queue = opts.ai ? new AiQueue(db, (id) => lookUp(id, {}), () => changes.bump(null), (line) => console.log(`[ai] queue: ${line}`)) : null;
  queue?.resume();
  const needQueue = () => {
    if (!queue) throw new ApiError(400, "VALIDATION", "AI isn't set up on this server (AI_URL)");
    return queue;
  };

  api.post("/items/:id/research", async (c) => {
    const id = intParam(c.req.param("id"));
    // The form's unsaved name, link, supplier and part number win over the saved ones: a link just
    // pasted in is read without saving first. No body at all means "as saved".
    const now = parseBody(researchSchema, await c.req.json().catch(() => ({})));
    const result = await lookUp(id, now);
    // Kept on the part for review (DEC-055); a cancel or dismiss clears it.
    const stored: StoredResearch = { ...result, at: new Date().toISOString(), mode: now.mode === "quick" ? "quick" : "full" };
    db.update(items).set({ aiResult: stored }).where(eq(items.id, id)).run();
    return c.json<ResearchResult>(result);
  });
  api.delete("/items/:id/research", (c) => {
    const id = intParam(c.req.param("id"));
    requireItemExists(db, id);
    db.update(items).set({ aiResult: null, aiJob: null, aiJobAt: null, aiJobError: null }).where(eq(items.id, id)).run();
    return c.json(getItem(db, id));
  });
  api.post("/items/:id/research/queue", (c) => {
    const id = intParam(c.req.param("id"));
    requireItemExists(db, id);
    needQueue().enqueue(id);
    return c.json(getItem(db, id));
  });
  api.delete("/items/:id/research/queue", (c) => {
    const id = intParam(c.req.param("id"));
    requireItemExists(db, id);
    needQueue().cancel(id);
    return c.json(getItem(db, id));
  });
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
  // A new square crop for a photo (DEC-030): the crop and the square thumbnail the phone cut.
  // Thumbnails are cached forever by name, so the new one gets a new name and the old one goes.
  api.put("/photos/:id/crop", async (c) => {
    const photoId = intParam(c.req.param("id"));
    requireItemPhoto(db, photoId);
    const body = await c.req.parseBody();
    const thumb = body.thumb;
    if (!(thumb instanceof File) || thumb.size > MAX_PHOTO_BYTES || !thumb.type.startsWith("image/")) {
      throw new ApiError(400, "VALIDATION", "Expected a thumb image under 10 MB");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(body.crop ?? ""));
    } catch {
      throw new ApiError(400, "VALIDATION", "crop: expected JSON");
    }
    const crop = parseBody(photoCropSchema, raw);
    const name = `p${photoId}-${randomUUID().slice(0, 8)}-thumb.jpg`;
    await writeFile(join(opts.photoDir, name), Buffer.from(await thumb.arrayBuffer()));
    const { item, oldThumb } = setPhotoCrop(db, photoId, crop, name);
    if (oldThumb && oldThumb !== name) await unlink(join(opts.photoDir, oldThumb)).catch(() => {});
    return c.json(item);
  });
  api.put("/photos/:id/main", (c) => c.json(setMainPhoto(db, intParam(c.req.param("id")))));
  api.delete("/photos/:id", async (c) => {
    const { item, files } = deletePhoto(db, intParam(c.req.param("id")));
    for (const f of files) await unlink(join(opts.photoDir, f)).catch(() => {});
    return c.json(item);
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
  // Remove a stickered unit from its part (DEC-063): retired, sticker freed, undoable.
  api.delete("/units/:id", (c) => {
    const { eventId, itemId } = retireUnit(db, intParam(c.req.param("id")));
    return c.json(result(eventId, itemId));
  });
  // A unit's own details (DEC-062): the per-unit fields' values. The part comes back, like PATCH /items.
  api.patch("/units/:id", async (c) => {
    const input = parseBody(updateUnitSchema, await c.req.json());
    const itemId = updateUnit(db, intParam(c.req.param("id")), input);
    return c.json(getItem(db, itemId));
  });
  // The Move sheet (DEC-067): any of a part's stickered units, or everything the part has, in one undoable step.
  api.post("/units/move", async (c) => {
    const { unitIds, toLocationId } = parseBody(moveUnitsSchema, await c.req.json());
    const { eventId, itemId } = moveUnits(db, unitIds, toLocationId);
    return c.json(result(eventId, itemId));
  });
  api.post("/items/:id/move-everything", async (c) => {
    const itemId = intParam(c.req.param("id"));
    const { toLocationId } = parseBody(moveUnitSchema, await c.req.json());
    const eventId = moveEverything(db, itemId, toLocationId);
    if (eventId === null) throw new ApiError(400, "VALIDATION", "It's all there already");
    return c.json(result(eventId, itemId));
  });
  api.post("/units/:id/move", async (c) => {
    const { toLocationId } = parseBody(moveUnitSchema, await c.req.json());
    const { eventId, itemId } = moveUnit(db, intParam(c.req.param("id")), toLocationId);
    return c.json(result(eventId, itemId));
  });

  // Two fields are really one (DEC-071): merged, and universal from then on. Every category back.
  api.post("/fields/merge", async (c) => {
    const { key, withKey } = parseBody(mergeFieldsSchema, await c.req.json());
    for (const id of mergeFields(db, key, withKey)) indexItem(db, id);
    return c.json(listCategories(db));
  });

  // ── Categories ──
  api.get("/categories", (c) => c.json(listCategories(db)));
  api.get("/categories/usage", (c) => c.json(categoryUsage(db)));
  api.get("/categories/:id/values", (c) => c.json(categoryValues(db, intParam(c.req.param("id")))));
  api.patch("/categories/:id", async (c) => c.json(updateCategory(db, intParam(c.req.param("id")), parseBody(updateCategorySchema, await c.req.json()))));
  api.delete("/categories/:id", (c) => {
    deleteCategory(db, intParam(c.req.param("id")));
    return c.json({ ok: true });
  });
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
