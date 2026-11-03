import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { categories, events, itemHomes, items, locations, photos, stock, units, type StockRow } from "./db/schema";
import { ApiError } from "./errors";
import { listEvents } from "./events";
import { locationPath } from "./locations";
import { isPinned } from "./pins";
import type {
  Category,
  CreateItem,
  Crumb,
  ItemDetail,
  ItemSummary,
  LocationItem,
  Place,
  UpdateItem,
} from "../shared/api";

// An exact count is "stale" (worth a recount) when it's old or has been changed a lot since.
const STALE_DAYS = 90;
const STALE_CHANGES = 10;

const sqliteDate = (s: string) => new Date(s.replace(" ", "T") + "Z");

export function isStale(tracking: string, row: Pick<StockRow, "qty" | "lastCountedAt" | "changesSinceCount">, now = new Date()) {
  if (tracking !== "exact" || row.qty === null) return false;
  const ageDays = (now.getTime() - sqliteDate(row.lastCountedAt).getTime()) / 86_400_000;
  return ageDays > STALE_DAYS || row.changesSinceCount >= STALE_CHANGES;
}

export const photoUrl = (file: string) => `/api/photos/${file}`;

function requireItem(db: Db, id: number) {
  const item = db.select().from(items).where(eq(items.id, id)).get();
  if (!item || item.archived) throw new ApiError(404, "NOT_FOUND", `No item ${id}`);
  return item;
}

export function requireLocation(db: Db, id: number) {
  const loc = db.select({ id: locations.id }).from(locations).where(eq(locations.id, id)).get();
  if (!loc) throw new ApiError(400, "VALIDATION", `Location ${id} does not exist`);
}

function thumbs(db: Db, itemIds: number[]) {
  const map = new Map<number, string>();
  if (itemIds.length === 0) return map;
  const rows = db
    .select({ itemId: photos.itemId, thumbPath: photos.thumbPath, path: photos.path })
    .from(photos)
    .where(inArray(photos.itemId, itemIds))
    .orderBy(asc(photos.id))
    .all();
  for (const r of rows) if (r.itemId && !map.has(r.itemId)) map.set(r.itemId, photoUrl(r.thumbPath ?? r.path));
  return map;
}

function placesFor(db: Db, itemId: number, tracking: string, paths: Map<number, Crumb[]>): Place[] {
  const pathOf = (id: number) => {
    if (!paths.has(id)) paths.set(id, locationPath(db, id));
    return paths.get(id)!;
  };
  const byLoc = new Map<number, Place>();
  const place = (locationId: number): Place => {
    let p = byLoc.get(locationId);
    if (!p) {
      p = { locationId, path: pathOf(locationId), hasStock: false, qty: null, level: null, units: 0, isHome: false, stale: false, lastCountedAt: null };
      byLoc.set(locationId, p);
    }
    return p;
  };
  for (const s of db.select().from(stock).where(eq(stock.itemId, itemId)).all()) {
    Object.assign(place(s.locationId), {
      hasStock: true,
      qty: s.qty,
      level: s.level,
      stale: isStale(tracking, s),
      lastCountedAt: s.lastCountedAt,
    });
  }
  const unitRows = db
    .select({ locationId: units.locationId, n: sql<number>`count(*)` })
    .from(units)
    .where(and(eq(units.itemId, itemId), ne(units.status, "retired")))
    .groupBy(units.locationId)
    .all();
  for (const u of unitRows) if (u.locationId !== null) place(u.locationId).units = u.n;
  for (const h of db.select().from(itemHomes).where(eq(itemHomes.itemId, itemId)).all()) place(h.locationId).isHome = true;
  // Homes first, then by path.
  return [...byLoc.values()].sort(
    (a, b) => Number(b.isHome) - Number(a.isHome) || a.path.map((c) => c.name).join("/").localeCompare(b.path.map((c) => c.name).join("/")),
  );
}

function totalQty(places: Place[]): number | null {
  let total: number | null = null;
  for (const p of places) {
    const n = (p.qty ?? 0) + p.units;
    if (p.qty !== null || p.units > 0) total = (total ?? 0) + n;
  }
  return total;
}

function summaries(db: Db, rows: (typeof items.$inferSelect)[]): ItemSummary[] {
  const thumbMap = thumbs(db, rows.map((r) => r.id));
  const catNames = new Map(db.select({ id: categories.id, name: categories.name }).from(categories).all().map((c) => [c.id, c.name]));
  const paths = new Map<number, Crumb[]>();
  return rows.map((r) => {
    const places = placesFor(db, r.id, r.tracking, paths);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      tracking: r.tracking,
      needsDetails: r.needsDetails,
      categoryName: r.categoryId ? (catNames.get(r.categoryId) ?? null) : null,
      thumbUrl: thumbMap.get(r.id) ?? null,
      totalQty: r.tracking === "exact" || places.some((p) => p.units > 0) ? totalQty(places) : null,
      places,
    };
  });
}

export function getItem(db: Db, id: number): ItemDetail {
  const item = requireItem(db, id);
  const [summary] = summaries(db, [item]);
  const cat = item.categoryId ? db.select().from(categories).where(eq(categories.id, item.categoryId)).get() : undefined;
  const photoRows = db.select().from(photos).where(eq(photos.itemId, id)).orderBy(asc(photos.id)).all();
  const unitRows = db
    .select()
    .from(units)
    .where(and(eq(units.itemId, id), ne(units.status, "retired")))
    .orderBy(asc(units.id))
    .all();
  return {
    ...summary!,
    categoryId: item.categoryId,
    fieldDefs: cat?.fieldDefs ?? [],
    attributes: Object.fromEntries(Object.entries(item.attributes).map(([k, v]) => [k, String(v)])),
    price: item.price,
    supplier: item.supplier,
    supplierPn: item.supplierPn,
    url: item.url,
    notes: item.notes,
    photos: photoRows.map((p) => ({ id: p.id, url: photoUrl(p.path), thumbUrl: photoUrl(p.thumbPath ?? p.path) })),
    unitList: unitRows.map((u) => ({
      id: u.id,
      code: u.code,
      label: u.label,
      locationId: u.locationId,
      homeLocationId: u.homeLocationId,
      path: u.locationId ? locationPath(db, u.locationId) : [],
    })),
    history: listEvents(db, { itemId: id, limit: 20 }),
    pinned: isPinned(db, "item", id),
  };
}

/** Rewrite the item's full-text search row (rowid = item id). */
export function indexItem(db: Db, id: number) {
  const item = db.select().from(items).where(eq(items.id, id)).get();
  db.run(sql`delete from items_fts where rowid = ${id}`);
  if (!item || item.archived) return;
  const cat = item.categoryId ? db.select({ name: categories.name }).from(categories).where(eq(categories.id, item.categoryId)).get() : undefined;
  const codes = db.select({ code: units.code }).from(units).where(eq(units.itemId, id)).all().map((u) => u.code);
  const details = [item.notes, item.supplier, item.supplierPn, ...Object.entries(item.attributes).flat(), ...codes]
    .filter(Boolean)
    .join(" ");
  db.run(sql`insert into items_fts (rowid, name, category, details) values (${id}, ${item.name}, ${cat?.name ?? ""}, ${details})`);
}

/** Every word must match the start of some word in the item ("m3 10" finds "M3 x 10mm"). */
export function ftsQuery(q: string): string | null {
  const tokens = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(" ") : null;
}

export function searchItems(db: Db, opts: { q?: string; needsDetails?: boolean; limit?: number }): ItemSummary[] {
  const limit = opts.limit ?? 50;
  const conds = [eq(items.archived, false)];
  if (opts.needsDetails) conds.push(eq(items.needsDetails, true));
  const match = opts.q ? ftsQuery(opts.q) : null;
  if (match) {
    const rows = db
      .select({ item: items })
      .from(items)
      .innerJoin(sql`items_fts`, sql`items_fts.rowid = ${items.id}`)
      .where(and(...conds, sql`items_fts match ${match}`))
      .orderBy(sql`bm25(items_fts, 10.0, 3.0, 1.0)`)
      .limit(limit)
      .all();
    return summaries(db, rows.map((r) => r.item));
  }
  const rows = db.select().from(items).where(and(...conds)).orderBy(desc(items.updatedAt), desc(items.id)).limit(limit).all();
  return summaries(db, rows);
}

/** Summaries in the order given (skipping archived or missing items). */
export function searchItemsByIds(db: Db, ids: number[]): ItemSummary[] {
  if (ids.length === 0) return [];
  const rows = db.select().from(items).where(and(inArray(items.id, ids), eq(items.archived, false))).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return summaries(db, ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r));
}

/** Parts you've taken some of lately: likely what's sitting in the put-back bin. Most recent first. */
export function recentlyUsed(db: Db, days = 30, limit = 20): ItemSummary[] {
  const rows = db
    .select({ itemId: events.itemId, last: sql<number>`max(${events.id})` })
    .from(events)
    .where(and(eq(events.type, "use"), isNull(events.undoneBy), sql`${events.at} >= datetime('now', ${`-${days} days`})`))
    .groupBy(events.itemId)
    .orderBy(desc(sql`max(${events.id})`))
    .limit(limit)
    .all();
  return searchItemsByIds(db, rows.map((r) => r.itemId).filter((x): x is number => x !== null));
}

export function countNeedsDetails(db: Db): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(items)
    .where(and(eq(items.needsDetails, true), eq(items.archived, false)))
    .get()!.n;
}

export function locationItems(db: Db, locationId: number): LocationItem[] {
  const stockRows = db
    .select({ s: stock, i: items })
    .from(stock)
    .innerJoin(items, eq(items.id, stock.itemId))
    .where(and(eq(stock.locationId, locationId), eq(items.archived, false)))
    .all();
  const unitRows = db
    .select({ i: items, n: sql<number>`count(*)` })
    .from(units)
    .innerJoin(items, eq(items.id, units.itemId))
    .where(and(eq(units.locationId, locationId), ne(units.status, "retired"), eq(items.archived, false)))
    .groupBy(items.id)
    .all();
  const byItem = new Map<number, LocationItem>();
  const entry = (i: typeof items.$inferSelect) => {
    let e = byItem.get(i.id);
    if (!e) {
      e = { itemId: i.id, name: i.name, thumbUrl: null, tracking: i.tracking, needsDetails: i.needsDetails, hasStock: false, qty: null, level: null, units: 0, stale: false };
      byItem.set(i.id, e);
    }
    return e;
  };
  for (const { s, i } of stockRows) Object.assign(entry(i), { hasStock: true, qty: s.qty, level: s.level, stale: isStale(i.tracking, s) });
  for (const { i, n } of unitRows) entry(i).units = n;
  const thumbMap = thumbs(db, [...byItem.keys()]);
  return [...byItem.values()]
    .map((e) => ({ ...e, thumbUrl: thumbMap.get(e.itemId) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function assertCodeFree(db: Db, code: string) {
  const loc = db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get();
  const unit = db.select({ id: units.id }).from(units).where(eq(units.code, code)).get();
  if (loc || unit) throw new ApiError(409, "CONFLICT", `Sticker ${code} is already assigned`);
}

export function createItem(db: Db, input: CreateItem): ItemDetail {
  if (input.code) assertCodeFree(db, input.code);
  if (input.locationId) requireLocation(db, input.locationId);
  const cat = input.categoryId ? db.select().from(categories).where(eq(categories.id, input.categoryId)).get() : undefined;
  if (input.categoryId && !cat) throw new ApiError(400, "VALIDATION", `Category ${input.categoryId} does not exist`);

  // A sticker of its own means a returnable (labeling rules, UX framework).
  const kind = input.kind ?? (input.code ? "returnable" : (cat?.defaultKind ?? "consumable"));
  const tracking = input.tracking ?? (input.level ? "level" : (cat?.defaultTracking ?? "exact"));

  const id = db.transaction(() => {
    const item = db
      .insert(items)
      // A quick capture (photo, maybe a name) needs details; a name plus a category is enough to skip the queue.
      .values({ name: input.name ?? "", categoryId: input.categoryId ?? null, kind, tracking, needsDetails: !(input.name && cat) })
      .returning({ id: items.id })
      .get();
    if (input.code) {
      db.insert(units).values({ itemId: item.id, code: input.code, locationId: input.locationId ?? null, homeLocationId: input.locationId ?? null }).run();
    }
    if (input.locationId) {
      // A stickered unit is counted by the unit itself; bulk stock only when a quantity/level was given or there's no sticker.
      if (!input.code || input.qty !== undefined || input.level !== undefined) {
        db.insert(stock)
          .values({
            itemId: item.id,
            locationId: input.locationId,
            qty: tracking === "exact" ? (input.qty ?? null) : null,
            level: tracking === "level" ? (input.level ?? "plenty") : null,
          })
          .run();
      }
      db.insert(itemHomes).values({ itemId: item.id, locationId: input.locationId }).run();
    }
    db.insert(events)
      .values({ type: "create", itemId: item.id, locationId: input.locationId ?? null, delta: input.qty ?? null })
      .run();
    return item.id;
  });
  indexItem(db, id);
  return getItem(db, id);
}

export function updateItem(db: Db, id: number, input: UpdateItem): ItemDetail {
  const before = requireItem(db, id);
  if (input.categoryId) {
    const cat = db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId)).get();
    if (!cat) throw new ApiError(400, "VALIDATION", `Category ${input.categoryId} does not exist`);
  }
  const { needsDetails, attributes, ...rest } = input;
  db.transaction(() => {
    db.update(items)
      .set({
        ...rest,
        ...(attributes ? { attributes: Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== "")) } : {}),
        needsDetails: needsDetails ?? false,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(items.id, id))
      .run();
    // Switching tracking mode converts the stock so nothing is lost.
    if (input.tracking && input.tracking !== before.tracking) {
      const rows = db.select().from(stock).where(eq(stock.itemId, id)).all();
      for (const r of rows) {
        const next =
          input.tracking === "level"
            ? { qty: null, level: r.qty === null ? "plenty" : r.qty > 0 ? "plenty" : "out" }
            : { qty: r.level === "out" ? 0 : null, level: null };
        db.update(stock)
          .set(next as Partial<StockRow>)
          .where(and(eq(stock.itemId, id), eq(stock.locationId, r.locationId)))
          .run();
      }
    }
  });
  indexItem(db, id);
  return getItem(db, id);
}

export function setHomes(db: Db, id: number, locationIds: number[]): ItemDetail {
  requireItem(db, id);
  for (const l of locationIds) requireLocation(db, l);
  db.transaction(() => {
    db.delete(itemHomes).where(eq(itemHomes.itemId, id)).run();
    for (const l of new Set(locationIds)) db.insert(itemHomes).values({ itemId: id, locationId: l }).run();
  });
  return getItem(db, id);
}

export function addPhoto(db: Db, itemId: number, path: string, thumbPath: string): ItemDetail {
  requireItem(db, itemId);
  db.insert(photos).values({ itemId, path, thumbPath }).run();
  db.update(items).set({ updatedAt: sql`(datetime('now'))` }).where(eq(items.id, itemId)).run();
  return getItem(db, itemId);
}

// ── Categories ───────────────────────────────────────────────────────────────

export function listCategories(db: Db): Category[] {
  return db.select().from(categories).where(isNull(categories.parentId)).orderBy(asc(categories.name)).all().map(toCategory);
}

function toCategory(c: typeof categories.$inferSelect): Category {
  return { id: c.id, name: c.name, defaultKind: c.defaultKind, defaultTracking: c.defaultTracking, fieldDefs: c.fieldDefs };
}

export const fieldKey = (label: string) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function createCategory(
  db: Db,
  input: { name: string; defaultKind?: "consumable" | "returnable"; defaultTracking?: "exact" | "level"; fields?: string[] },
): Category {
  const exists = db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = lower(${input.name})`).get();
  if (exists) throw new ApiError(409, "CONFLICT", `Category ${input.name} already exists`);
  const row = db
    .insert(categories)
    .values({
      name: input.name,
      defaultKind: input.defaultKind ?? "consumable",
      defaultTracking: input.defaultTracking ?? "exact",
      fieldDefs: (input.fields ?? []).map((label) => ({ key: fieldKey(label), label, type: "text" as const })),
    })
    .returning()
    .get();
  return toCategory(row);
}

/** Starter categories so the first catalog session isn't spent on setup. Editable later. */
export const STARTER_CATEGORIES: Parameters<typeof createCategory>[1][] = [
  { name: "Electronic components", defaultTracking: "exact", fields: ["Value", "Package", "Part number"] },
  { name: "Modules & boards", defaultKind: "returnable", defaultTracking: "exact", fields: ["Interface", "Voltage"] },
  { name: "Fasteners", defaultTracking: "level", fields: ["Thread", "Length", "Head", "Material"] },
  { name: "Wire & connectors", defaultTracking: "level", fields: ["Gauge", "Type"] },
  { name: "Power supplies", defaultKind: "returnable", defaultTracking: "exact", fields: ["Voltage", "Current", "Connector"] },
  { name: "Tools", defaultKind: "returnable", defaultTracking: "exact" },
  { name: "Supplies", defaultTracking: "level" },
];
