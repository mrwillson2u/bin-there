import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "./db/client";
import { categories, events, fields, itemHomes, items, locations, photos, pins, stock, units, type FieldDef, type StockRow } from "./db/schema";
import { bare, createField, fieldName, isFieldKey, renameField } from "./fields";
import { keptName, leavingValues } from "../shared/fields";
import { ApiError } from "./errors";
import { listEvents } from "./events";
import { locationPath, outOf } from "./locations";
import { isPinned } from "./pins";
import { crumbLabel, type SimilarItem } from "../shared/api";
import type {
  Category,
  CategoryUsage,
  CategoryValues,
  CheckedOutUnit,
  CreateItem,
  Crumb,
  Inventory,
  InventoryQuery,
  ItemDetail,
  ItemSummary,
  LocationItem,
  PhotoCrop,
  Place,
  ReviewEntry,
  UpdateCategory,
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

/** A project kit is temporary (DEC-019): nothing ever calls it home. */
export function isProject(db: Db, id: number | null | undefined): boolean {
  if (id == null) return false;
  return db.select({ type: locations.type }).from(locations).where(eq(locations.id, id)).get()?.type === "project";
}

function thumbs(db: Db, itemIds: number[]) {
  const map = new Map<number, string>();
  if (itemIds.length === 0) return map;
  const rows = db
    .select({ itemId: photos.itemId, thumbPath: photos.thumbPath, path: photos.path })
    .from(photos)
    .where(inArray(photos.itemId, itemIds))
    .orderBy(desc(photos.isMain), asc(photos.id))
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
      p = { locationId, path: pathOf(locationId), hasStock: false, qty: null, level: null, units: 0, isHome: false, stale: false, lastCountedAt: null, out: null };
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
  // A bin taken out to a project kit: say where it is now (DEC-028).
  const outRows = byLoc.size
    ? db
        .select({ id: locations.id, outAt: locations.outAt, outToId: locations.outToId, outNote: locations.outNote })
        .from(locations)
        .where(and(inArray(locations.id, [...byLoc.keys()]), isNotNull(locations.outAt)))
        .all()
    : [];
  for (const r of outRows) byLoc.get(r.id)!.out = outOf(db, r);
  // Homes first, then by path.
  return [...byLoc.values()].sort(
    (a, b) => Number(b.isHome) - Number(a.isHome) || a.path.map(crumbLabel).join("/").localeCompare(b.path.map(crumbLabel).join("/"), undefined, { numeric: true }),
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
    const u = db
      .select({
        out: sql<number>`coalesce(sum(${units.status} = 'checked_out'), 0)`,
        unplaced: sql<number>`coalesce(sum(${units.locationId} is null), 0)`,
      })
      .from(units)
      .where(and(eq(units.itemId, r.id), ne(units.status, "retired")))
      .get()!;
    const placed = totalQty(places);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      tracking: r.tracking,
      needsDetails: r.needsDetails,
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (catNames.get(r.categoryId) ?? null) : null,
      thumbUrl: thumbMap.get(r.id) ?? null,
      // Units out with no location (e.g. "lent to Sam") still count.
      totalQty: placed === null && u.unplaced === 0 ? null : (placed ?? 0) + u.unplaced,
      checkedOut: u.out,
      lowThreshold: r.lowThreshold,
      places,
    };
  });
}

export function getItem(db: Db, id: number): ItemDetail {
  const item = requireItem(db, id);
  const [summary] = summaries(db, [item]);
  const cat = item.categoryId ? db.select().from(categories).where(eq(categories.id, item.categoryId)).get() : undefined;
  // The main photo first (DEC-031): the marked one, or else the oldest.
  const photoRows = db.select().from(photos).where(eq(photos.itemId, id)).orderBy(desc(photos.isMain), asc(photos.id)).all();
  const unitRows = db
    .select()
    .from(units)
    .where(and(eq(units.itemId, id), ne(units.status, "retired")))
    .orderBy(asc(units.id))
    .all();
  return {
    ...summary!,
    fieldDefs: cat?.fieldDefs ?? [],
    attributes: Object.fromEntries(Object.entries(item.attributes).map(([k, v]) => [k, String(v)])),
    custom: item.custom ?? {},
    similar: item.needsDetails ? similarItems(db, item) : [],
    price: item.price,
    supplier: item.supplier,
    supplierPn: item.supplierPn,
    url: item.url,
    notes: item.notes,
    aiFields: item.aiFields ?? {},
    aiJob: item.aiJob ? { state: item.aiJob, at: item.aiJobAt ?? null, error: item.aiJobError ?? null } : null,
    aiResult: item.aiResult ?? null,
    photos: photoRows.map((p, i) => ({
      id: p.id,
      main: i === 0,
      url: photoUrl(p.path),
      thumbUrl: photoUrl(p.thumbPath ?? p.path),
      crop: p.cropX !== null && p.cropY !== null && p.cropSize !== null ? { x: p.cropX, y: p.cropY, size: p.cropSize } : null,
    })),
    unitList: unitRows.map((u) => ({
      id: u.id,
      code: u.code,
      label: u.label,
      locationId: u.locationId,
      homeLocationId: u.homeLocationId,
      path: u.locationId ? locationPath(db, u.locationId) : [],
      out: u.status === "checked_out" ? { at: u.checkedOutAt ?? u.updatedAt, note: u.checkedOutNote } : null,
      attributes: u.attributes ?? {},
    })),
    history: listEvents(db, { itemId: id, limit: 20 }),
    pinned: isPinned(db, "item", id),
  };
}

const squashPn = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parts already on record that a new part looks like (DEC-075): one with the same part number, or
 * the same name. The new part's own name and number count, and so do the AI's guesses at them,
 * so the hint can come before anything is typed. Up to three, part-number matches first.
 */
export function similarItems(db: Db, item: typeof items.$inferSelect): SimilarItem[] {
  const guess = (field: string) => item.aiResult?.suggestions.find((s) => s.field === field)?.value ?? "";
  const names = [item.name, guess("name")].map(bare).filter((n) => n.length >= 4);
  const numbers = [item.supplierPn ?? "", guess("supplierPn")].map(squashPn).filter((n) => n.length >= 4);
  if (names.length === 0 && numbers.length === 0) return [];
  const why = (r: typeof items.$inferSelect) => (r.supplierPn && numbers.includes(squashPn(r.supplierPn)) ? "number" : names.includes(bare(r.name)) ? "name" : null);
  const rows = db.select().from(items).where(and(eq(items.archived, false), ne(items.id, item.id))).all().filter(why);
  rows.sort((a, b) => Number(why(b) === "number") - Number(why(a) === "number") || a.id - b.id);
  const top = rows.slice(0, 3);
  return summaries(db, top).map((s, i) => ({
    id: s.id,
    name: s.name,
    thumbUrl: s.thumbUrl,
    where: s.places[0] ? s.places[0].path.map(crumbLabel).join(" › ") : null,
    why: why(top[i]!)!,
  }));
}

/** Rewrite the item's full-text search row (rowid = item id). */
export function indexItem(db: Db, id: number) {
  const item = db.select().from(items).where(eq(items.id, id)).get();
  db.run(sql`delete from items_fts where rowid = ${id}`);
  if (!item || item.archived) return;
  const cat = item.categoryId ? db.select({ name: categories.name, fieldDefs: categories.fieldDefs }).from(categories).where(eq(categories.id, item.categoryId)).get() : undefined;
  const codes = db.select({ code: units.code }).from(units).where(eq(units.itemId, id)).all().map((u) => u.code);
  // What the part's page shows (DEC-071): its category's fields, by label, and its custom fields.
  const shown = cat?.fieldDefs ?? [];
  const fieldWords = shown.flatMap((f) => (item.attributes[f.key] ? [f.label, item.attributes[f.key]] : []));
  const details = [item.notes, item.supplier, item.supplierPn, ...fieldWords, ...Object.entries(item.custom ?? {}).flat(), ...codes]
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

/**
 * The home screen's list of every part (DEC-026): filtered, sorted, a page at a time, with
 * pinned parts that pass the filters on top and left out of the pages below.
 */
export function listInventory(db: Db, f: InventoryQuery): Inventory {
  const conds: SQL[] = [eq(items.archived, false)];
  if (f.needs) conds.push(eq(items.needsDetails, true));
  if (f.kind) conds.push(eq(items.kind, f.kind));
  if (f.cat === "none") conds.push(isNull(items.categoryId));
  else if (f.cat !== undefined) conds.push(eq(items.categoryId, f.cat));
  if (f.out) conds.push(sql`exists (select 1 from units u where u.item_id = ${items.id} and u.status = 'checked_out')`);
  if (f.low) conds.push(inArray(items.id, listLow(db).map((i) => i.id)));
  if (f.stale) conds.push(inArray(items.id, [...new Set(listStale(db).map((e) => e.itemId))]));
  const match = f.q ? ftsQuery(f.q) : null;
  if (match) conds.push(sql`${items.id} in (select rowid from items_fts where items_fts match ${match})`);
  const where = and(...conds)!;

  const pinIds = db
    .select({ itemId: pins.itemId })
    .from(pins)
    .where(isNotNull(pins.itemId))
    .orderBy(desc(pins.id))
    .all()
    .map((r) => r.itemId!);
  const pinnedRows = pinIds.length ? db.select().from(items).where(and(where, inArray(items.id, pinIds))).all() : [];
  const byId = new Map(pinnedRows.map((r) => [r.id, r]));
  const pinned = f.offset === 0 ? summaries(db, pinIds.flatMap((id) => byId.get(id) ?? [])) : [];

  const total = db.select({ n: sql<number>`count(*)` }).from(items).where(where).get()!.n;
  const rest = pinIds.length ? and(where, notInArray(items.id, pinIds))! : where;
  const sort = f.sort ?? (match ? "match" : "name");
  const rows =
    sort === "match"
      ? db
          .select({ item: items })
          .from(items)
          .innerJoin(sql`items_fts`, sql`items_fts.rowid = ${items.id}`)
          .where(and(rest, sql`items_fts match ${match}`))
          .orderBy(sql`bm25(items_fts, 10.0, 3.0, 1.0)`, asc(items.id))
          .limit(f.limit)
          .offset(f.offset)
          .all()
          .map((r) => r.item)
      : db
          .select()
          .from(items)
          .where(rest)
          .orderBy(
            ...(sort === "recent"
              ? [desc(items.updatedAt), desc(items.id)]
              : sort === "added"
                ? [desc(items.id)]
                : // Unnamed parts last, then A to Z ignoring case.
                  [sql`${items.name} = ''`, sql`${items.name} collate nocase`, asc(items.id)]),
          )
          .limit(f.limit)
          .offset(f.offset)
          .all();
  const end = f.offset + rows.length;
  return { pinned, items: summaries(db, rows), total, next: end < total - pinnedRows.length ? end : null };
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

/** Every stickered unit that's out right now, longest-out first. */
export function listCheckedOut(db: Db): CheckedOutUnit[] {
  const rows = db
    .select({ u: units, name: items.name })
    .from(units)
    .innerJoin(items, eq(items.id, units.itemId))
    .where(and(eq(units.status, "checked_out"), eq(items.archived, false)))
    .orderBy(asc(units.checkedOutAt))
    .all();
  const thumbMap = thumbs(db, [...new Set(rows.map((r) => r.u.itemId))]);
  return rows.map(({ u, name }) => ({
    unitId: u.id,
    code: u.code,
    itemId: u.itemId,
    itemName: name,
    thumbUrl: thumbMap.get(u.itemId) ?? null,
    path: u.locationId ? locationPath(db, u.locationId) : [],
    homePath: u.homeLocationId ? locationPath(db, u.homeLocationId) : [],
    at: u.checkedOutAt ?? u.updatedAt,
    note: u.checkedOutNote,
  }));
}

/** Every stale exact count, in walking order (by location path). The staleness review list. */
export function listStale(db: Db, now = new Date()): ReviewEntry[] {
  const rows = db
    .select({ s: stock, i: items })
    .from(stock)
    .innerJoin(items, eq(items.id, stock.itemId))
    .where(and(eq(items.archived, false), eq(items.tracking, "exact")))
    .all()
    .filter(({ s, i }) => isStale(i.tracking, s, now));
  const thumbMap = thumbs(db, [...new Set(rows.map((r) => r.i.id))]);
  return rows
    .map(({ s, i }) => ({
      itemId: i.id,
      name: i.name,
      thumbUrl: thumbMap.get(i.id) ?? null,
      locationId: s.locationId,
      path: locationPath(db, s.locationId),
      qty: s.qty!,
      lastCountedAt: s.lastCountedAt,
      changesSinceCount: s.changesSinceCount,
    }))
    .sort((a, b) => pathKey(a.path).localeCompare(pathKey(b.path)) || a.name.localeCompare(b.name));
}

const pathKey = (path: Crumb[]) => path.map((c) => c.name).join("/");

/**
 * The shopping list: level items that are low or out anywhere, and exact items whose total
 * is zero or at/below their low-stock threshold. Worst first.
 */
export function listLow(db: Db): ItemSummary[] {
  const rows = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.archived, false),
        sql`(
          exists (select 1 from stock s where s.item_id = ${items.id} and (s.level in ('low', 'out') or s.qty = 0))
          or ${items.lowThreshold} is not null
        )`,
      ),
    )
    .all();
  const rank = (i: ItemSummary): number => {
    if (i.tracking === "level") {
      const levels = i.places.map((p) => p.level);
      return levels.includes("out") ? 0 : levels.includes("low") ? 1 : 9;
    }
    if (i.totalQty === null) return 9;
    if (i.totalQty === 0) return 0;
    return i.lowThreshold !== null && i.totalQty <= i.lowThreshold ? 1 : 9;
  };
  return summaries(db, rows)
    .map((i) => ({ i, r: rank(i) }))
    .filter(({ r }) => r < 9)
    .sort((a, b) => a.r - b.r || a.i.name.localeCompare(b.i.name))
    .map(({ i }) => i);
}

/**
 * Every part on the Needs details list, in the order they were added, in full: the page that
 * works through them (DEC-037) edits each one in place, the same as the part's own page.
 */
export function listNeedsDetails(db: Db): ItemDetail[] {
  return db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.needsDetails, true), eq(items.archived, false)))
    .orderBy(asc(items.createdAt), asc(items.id))
    .all()
    .map((r) => getItem(db, r.id));
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
      e = { itemId: i.id, name: i.name, thumbUrl: null, tracking: i.tracking, needsDetails: i.needsDetails, hasStock: false, qty: null, level: null, units: 0, stale: false, homePath: [] };
      byItem.set(i.id, e);
    }
    return e;
  };
  for (const { s, i } of stockRows) Object.assign(entry(i), { hasStock: true, qty: s.qty, level: s.level, stale: isStale(i.tracking, s) });
  for (const { i, n } of unitRows) entry(i).units = n;
  const thumbMap = thumbs(db, [...byItem.keys()]);
  const homeOf = (itemId: number) => db.select({ l: itemHomes.locationId }).from(itemHomes).where(eq(itemHomes.itemId, itemId)).get()?.l;
  return [...byItem.values()]
    .map((e) => {
      const home = homeOf(e.itemId);
      return { ...e, thumbUrl: thumbMap.get(e.itemId) ?? null, homePath: home ? locationPath(db, home) : [] };
    })
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
  const homeId = isProject(db, input.locationId) ? null : (input.locationId ?? null);

  const id = db.transaction(() => {
    const item = db
      .insert(items)
      // A quick capture (photo, maybe a name) needs details; a name plus a category is enough to skip the queue.
      .values({ name: input.name ?? "", categoryId: input.categoryId ?? null, kind, tracking, needsDetails: !(input.name && cat) })
      .returning({ id: items.id })
      .get();
    if (input.code) {
      db.insert(units).values({ itemId: item.id, code: input.code, locationId: input.locationId ?? null, homeLocationId: homeId }).run();
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
      if (homeId) db.insert(itemHomes).values({ itemId: item.id, locationId: homeId }).run();
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
  const { needsDetails, attributes, custom, categoryValues, ...rest } = input;
  // A part comes off the Needs details list once it has a name and a category (DEC-007, Q47).
  const name = input.name ?? before.name;
  const categoryId = input.categoryId !== undefined ? input.categoryId : before.categoryId;
  // Category field values go by field key (DEC-071); a part's custom fields are their own store.
  const bad = Object.keys(attributes ?? {}).find((k) => !isFieldKey(k));
  if (bad) throw new ApiError(400, "VALIDATION", `${bad} isn't a field; a field of the part's own goes in custom`);
  const values: Record<string, string | number> = attributes ? Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== "")) : { ...before.attributes };
  const template = categoryId ? (db.select({ f: categories.fieldDefs }).from(categories).where(eq(categories.id, categoryId)).get()?.f ?? []) : [];
  let customNext: Record<string, string> | undefined;
  if (custom) {
    // A custom field named like one of the category's fields is that field: names are checked
    // here, once, so the two never sit side by side.
    const known = new Map<string, { key: string; label: string }>();
    for (const f of template) if (!f.perUnit) known.set(bare(f.label), { key: f.key, label: f.label });
    customNext = {};
    for (const [rawName, value] of Object.entries(custom)) {
      const name = fieldName(rawName);
      if (!name || value === "") continue;
      const match = known.get(bare(name));
      if (!match) customNext[name] = value;
      else if (!String(values[match.key] ?? "").trim() || String(values[match.key]) === value) values[match.key] = value;
      else throw new ApiError(400, "VALIDATION", `${match.label} is already one of this part's fields; change it there`);
    }
  }
  // A field belongs to one category (DEC-072): on a category change, what the part held in the
  // old category's fields is kept (in the new category's same-named field if it fits, else as a
  // custom field) or deleted. Nothing of another category stays on the part.
  const unitWrites = new Map<number, Record<string, string>>();
  let marks: Record<string, unknown> | undefined;
  const movedMarks = new Map<string, string>();
  if (categoryId !== before.categoryId) {
    const old = before.categoryId ? db.select().from(categories).where(eq(categories.id, before.categoryId)).get() : undefined;
    const unitRows = db.select({ id: units.id, code: units.code, attributes: units.attributes }).from(units).where(eq(units.itemId, id)).all();
    const leaving = leavingValues(old?.fieldDefs ?? [], template, values, unitRows);
    const kept = customNext ?? { ...(before.custom ?? {}) };
    const taken = (n: string) => n in kept || template.some((f) => bare(f.label) === bare(n));
    for (const l of leaving) {
      const own = l.unitId ? (unitWrites.get(l.unitId) ?? { ...(unitRows.find((u) => u.id === l.unitId)!.attributes ?? {}) }) : null;
      if (own) unitWrites.set(l.unitId!, own);
      if (categoryValues !== "delete") {
        if (l.into) (own ?? values)[l.into] = l.value;
        else kept[keptName(l, old?.name ?? "old", taken)] = l.value;
        if (l.into && !own) movedMarks.set(`attributes.${l.key}`, `attributes.${l.into}`);
      }
    }
    // Nothing under a field the new category doesn't have goes with the part.
    const stays = new Set(template.map((f) => f.key));
    for (const k of Object.keys(values)) if (!stays.has(k)) delete values[k];
    for (const u of unitRows) {
      const own = unitWrites.get(u.id) ?? { ...(u.attributes ?? {}) };
      const gone = Object.keys(own).filter((k) => !stays.has(k));
      if (gone.length === 0 && !unitWrites.has(u.id)) continue;
      for (const k of gone) delete own[k];
      unitWrites.set(u.id, own);
    }
    const aiNow = (input.aiFields ?? before.aiFields ?? {}) as Record<string, unknown>;
    if (Object.keys(aiNow).some((k) => k.startsWith("attributes.") && !stays.has(k.slice(11)))) {
      // The AI's mark follows a value into its new field; the marks of values that left go.
      marks = Object.fromEntries(
        Object.entries(aiNow)
          .map(([k, v]) => [movedMarks.get(k) ?? k, v] as [string, unknown])
          .filter(([k]) => !k.startsWith("attributes.") || stays.has(k.slice(11))),
      );
    }
    if (leaving.length > 0 || custom) customNext = kept;
  }
  const writeAttributes = !!attributes || !!custom || categoryId !== before.categoryId;
  db.transaction(() => {
    db.update(items)
      .set({
        ...rest,
        ...(writeAttributes ? { attributes: values } : {}),
        ...(customNext ? { custom: customNext } : {}),
        ...(marks ? { aiFields: marks as typeof before.aiFields } : {}),
        needsDetails: needsDetails ?? !(name && categoryId),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(items.id, id))
      .run();
    for (const [unitId, own] of unitWrites) db.update(units).set({ attributes: own }).where(eq(units.id, unitId)).run();
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

/**
 * Soft delete: hidden everywhere, history kept. Its stickers are freed so they can go on
 * something else. Undoable (events.ts) while it's the item's latest change.
 */
export function archiveItem(db: Db, id: number): { eventId: number } {
  requireItem(db, id);
  const unitRows = db.select({ id: units.id, code: units.code, status: units.status }).from(units).where(eq(units.itemId, id)).all();
  const eventId = db.transaction(() => {
    db.update(items).set({ archived: true, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, id)).run();
    db.update(units).set({ status: "retired", code: null, updatedAt: sql`(datetime('now'))` }).where(eq(units.itemId, id)).run();
    db.delete(pins).where(eq(pins.itemId, id)).run();
    return db
      .insert(events)
      .values({ type: "archive", itemId: id, undoData: { archive: { units: unitRows } } })
      .returning({ id: events.id })
      .get().id;
  });
  indexItem(db, id);
  return { eventId };
}

export function addPhoto(db: Db, itemId: number, path: string, thumbPath: string): ItemDetail {
  requireItem(db, itemId);
  db.insert(photos).values({ itemId, path, thumbPath }).run();
  db.update(items).set({ updatedAt: sql`(datetime('now'))` }).where(eq(items.id, itemId)).run();
  return getItem(db, itemId);
}

/**
 * A new square crop for a photo (DEC-030), with the square thumbnail the phone made from it.
 * The original is never touched. Returns the thumbnail it replaces, so the caller can delete it.
 */
export function requireItemPhoto(db: Db, photoId: number) {
  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get();
  if (!photo || photo.itemId === null) throw new ApiError(404, "NOT_FOUND", `No photo ${photoId}`);
  return photo as typeof photo & { itemId: number };
}

export function setPhotoCrop(db: Db, photoId: number, crop: PhotoCrop, thumbPath: string): { item: ItemDetail; oldThumb: string | null } {
  const photo = requireItemPhoto(db, photoId);
  db.update(photos).set({ cropX: crop.x, cropY: crop.y, cropSize: crop.size, thumbPath }).where(eq(photos.id, photoId)).run();
  db.update(items).set({ updatedAt: sql`(datetime('now'))` }).where(eq(items.id, photo.itemId)).run();
  return { item: getItem(db, photo.itemId), oldThumb: photo.thumbPath };
}

/** Make this the photo shown for its item everywhere (DEC-031). */
export function setMainPhoto(db: Db, photoId: number): ItemDetail {
  const photo = requireItemPhoto(db, photoId);
  db.transaction((tx) => {
    tx.update(photos).set({ isMain: false }).where(eq(photos.itemId, photo.itemId)).run();
    tx.update(photos).set({ isMain: true }).where(eq(photos.id, photoId)).run();
    tx.update(items).set({ updatedAt: sql`(datetime('now'))` }).where(eq(items.id, photo.itemId)).run();
  });
  return getItem(db, photo.itemId);
}

/** Remove a photo (DEC-031). Returns its files for the caller to delete; backups keep their copies. */
export function deletePhoto(db: Db, photoId: number): { item: ItemDetail; files: string[] } {
  const photo = requireItemPhoto(db, photoId);
  db.delete(photos).where(eq(photos.id, photoId)).run();
  db.update(items).set({ updatedAt: sql`(datetime('now'))` }).where(eq(items.id, photo.itemId)).run();
  return { item: getItem(db, photo.itemId), files: [photo.path, ...(photo.thumbPath ? [photo.thumbPath] : [])] };
}

// ── Categories ───────────────────────────────────────────────────────────────

/**
 * The names of the parts in each category, most recently changed first, up to `per` each (DEC-065):
 * how the owner names things, for the AI. Parts still needing details, archived ones and `exceptId` are left out.
 */
export function categoryNames(db: Db, exceptId: number, per = 12): Record<string, string[]> {
  const rows = db
    .select({ name: items.name, category: categories.name })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.archived, false), eq(items.needsDetails, false), ne(items.id, exceptId)))
    .orderBy(desc(items.updatedAt), desc(items.id))
    .all();
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const list = (out[r.category] ??= []);
    const name = r.name.trim();
    if (name && list.length < per && !list.includes(name)) list.push(name);
  }
  return out;
}

export function listCategories(db: Db): Category[] {
  return db.select().from(categories).where(isNull(categories.parentId)).orderBy(asc(categories.name)).all().map(toCategory);
}

function toCategory(c: typeof categories.$inferSelect): Category {
  return { id: c.id, name: c.name, defaultKind: c.defaultKind, defaultTracking: c.defaultTracking, fieldDefs: c.fieldDefs };
}

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
    })
    .returning()
    .get();
  // Each field is a row of its own, keyed by its ID (DEC-071); a name given twice is one field.
  const names = [...new Map((input.fields ?? []).map((l) => [bare(l), fieldName(l)])).values()].filter(Boolean);
  const fieldDefs = names.map((label) => ({ key: createField(db, label, row.id), label, type: "text" as const }));
  if (fieldDefs.length > 0) db.update(categories).set({ fieldDefs }).where(eq(categories.id, row.id)).run();
  return toCategory({ ...row, fieldDefs });
}

/**
 * Edit a category (DEC-056, DEC-071). A field is known by its key, its ID, so renaming or moving
 * it keeps the parts' values.
 * A new entry makes a field of this category's own, whatever other categories call theirs
 * (DEC-072). A field left out leaves the template; its values stay with the parts. Two
 * fields of one name can't be in one category. The category's parts are re-indexed for search.
 */
export function updateCategory(db: Db, id: number, input: UpdateCategory): Category {
  const current = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!current) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const changes: Partial<typeof categories.$inferInsert> = {};
  if (input.name !== undefined && input.name !== current.name) {
    const clash = db.select({ id: categories.id }).from(categories).where(and(sql`lower(${categories.name}) = lower(${input.name})`, ne(categories.id, id))).get();
    if (clash) throw new ApiError(409, "CONFLICT", `Category ${input.name} already exists`);
    changes.name = input.name;
  }
  if (input.defaultKind !== undefined) changes.defaultKind = input.defaultKind;
  if (input.defaultTracking !== undefined) changes.defaultTracking = input.defaultTracking;
  const renames: [string, string][] = [];
  if (input.fieldDefs !== undefined) {
    const names = new Set<string>();
    const next: FieldDef[] = [];
    for (const f of input.fieldDefs) {
      const existing = f.key ? current.fieldDefs.find((d) => d.key === f.key) : undefined;
      const label = fieldName(f.label);
      let key: string;
      if (existing) {
        key = existing.key;
        if (label !== existing.label) renames.push([key, label]);
      } else {
        // A field this category had before and dropped comes back as itself, with the parts' values.
        const old = db.select().from(fields).where(eq(fields.categoryId, id)).all().find((r) => bare(r.name) === bare(label) && !current.fieldDefs.some((d) => d.key === `f${r.id}`));
        if (old) {
          key = `f${old.id}`;
          if (old.name !== label) renames.push([key, label]);
        } else key = createField(db, label, id);
      }
      if (names.has(bare(label)) || next.some((d) => d.key === key)) throw new ApiError(400, "VALIDATION", `${current.name} already has a field named ${label}`);
      names.add(bare(label));
      const type = f.type ?? existing?.type ?? "text";
      // A choice field's options, each once (DEC-059); turning a field back to text drops them.
      const options = type === "choice" ? [...new Set(f.options ?? existing?.options ?? [])] : undefined;
      const perUnit = f.perUnit ?? existing?.perUnit ?? false;
      next.push({ key, label, type, ...(options ? { options } : {}), ...(perUnit ? { perUnit } : {}) });
    }
    changes.fieldDefs = next;
  }
  if (Object.keys(changes).length > 0) db.update(categories).set(changes).where(eq(categories.id, id)).run();
  for (const [key, name] of renames) renameField(db, key, name);
  if (changes.fieldDefs || changes.name) {
    for (const row of db.select({ id: items.id }).from(items).where(eq(items.categoryId, id)).all()) indexItem(db, row.id);
  }
  return toCategory(db.select().from(categories).where(eq(categories.id, id)).get()!);
}

/** Delete a category no part uses (DEC-056); refused, with the count, while parts still use it. */
export function deleteCategory(db: Db, id: number): void {
  if (!db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get()) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const used = db.select({ n: sql<number>`count(*)` }).from(items).where(and(eq(items.categoryId, id), eq(items.archived, false))).get()!.n;
  if (used > 0) throw new ApiError(409, "CONFLICT", `${used} ${used === 1 ? "part uses" : "parts use"} this category; move them first`);
  db.delete(fields).where(eq(fields.categoryId, id)).run();
  db.delete(categories).where(eq(categories.id, id)).run();
}

/** How much each category is used (DEC-056): parts in it, and per field, parts holding a value. */
export function categoryUsage(db: Db): Record<number, CategoryUsage> {
  const out: Record<number, CategoryUsage> = {};
  for (const c of db.select().from(categories).all()) out[c.id] = { items: 0, fields: Object.fromEntries(c.fieldDefs.map((f) => [f.key, 0])) };
  for (const row of db.select({ categoryId: items.categoryId, attributes: items.attributes }).from(items).where(eq(items.archived, false)).all()) {
    if (!row.categoryId || !out[row.categoryId]) continue;
    const u = out[row.categoryId]!;
    u.items++;
    for (const [k, v] of Object.entries(row.attributes ?? {})) if (String(v ?? "").trim() && k in u.fields) u.fields[k] = (u.fields[k] ?? 0) + 1;
  }
  return out;
}

/**
 * The values a category's parts already hold in each text field (DEC-060), most used first,
 * then alphabetical, at most 30 a field: the form offers them as you type, so "20 AWG" is
 * spelled one way. Choice fields have their own list and are left out.
 */
export function categoryValues(db: Db, id: number): CategoryValues {
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!cat) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const counts = new Map<string, Map<string, number>>();
  // Per-unit fields (DEC-062) live on the units, not the parts: nothing to offer from here.
  for (const f of cat.fieldDefs) if (f.type !== "choice" && !f.perUnit) counts.set(f.key, new Map());
  for (const row of db.select({ attributes: items.attributes }).from(items).where(and(eq(items.categoryId, id), eq(items.archived, false))).all()) {
    for (const [k, v] of Object.entries(row.attributes ?? {})) {
      const value = String(v ?? "").trim();
      const m = counts.get(k);
      if (!value || !m) continue;
      m.set(value, (m.get(value) ?? 0) + 1);
    }
  }
  const out: CategoryValues = {};
  for (const [k, m] of counts) {
    out[k] = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30)
      .map(([v]) => v);
  }
  return out;
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
  // Added by migration 0009 to databases that already had categories (DEC-027).
  { name: "Batteries", defaultTracking: "exact", fields: ["Size", "Chemistry", "Voltage", "Capacity"] },
  { name: "Resistors", defaultTracking: "level", fields: ["Resistance", "Tolerance", "Power", "Package"] },
  { name: "Capacitors", defaultTracking: "level", fields: ["Capacitance", "Voltage", "Type", "Package"] },
  { name: "Inductors", defaultTracking: "exact", fields: ["Inductance", "Current", "Package"] },
  { name: "Diodes", defaultTracking: "level", fields: ["Part number", "Type", "Package"] },
  { name: "LEDs", defaultTracking: "level", fields: ["Color", "Size", "Package"] },
  { name: "Transistors", defaultTracking: "exact", fields: ["Part number", "Type", "Package"] },
  { name: "ICs", defaultTracking: "exact", fields: ["Part number", "Function", "Package"] },
  { name: "Switches & buttons", defaultTracking: "exact", fields: ["Type", "Rating", "Mounting"] },
];
