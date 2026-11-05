import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { ftsQuery } from "./items";
import type { Category, EventView, Inventory, ItemDetail, ItemSummary, LocationDetail, ScanResult, StockResult } from "../shared/api";

let api: ReturnType<typeof createApi>;

beforeEach(() => {
  api = createApi(openDb(":memory:"), { photoDir: mkdtempSync(join(tmpdir(), "snt-photos-")) });
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await api.request(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}
const ok = async <T>(method: string, path: string, body?: unknown) => {
  const r = await call<T>(method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

let siteId: number;
beforeEach(async () => {
  siteId = (await ok<LocationDetail>("POST", "/locations", { name: "Garage", type: "site" })).id;
});
const bin = (name: string, code?: string) => ok<LocationDetail>("POST", "/locations", { name, type: "bin", code, parentId: siteId });
const item = (body: object) => ok<ItemDetail>("POST", "/items", body);
const adjust = (body: object) => ok<StockResult>("POST", "/stock/adjust", body);

describe("deleting items", () => {
  it("hides the item, frees its sticker, and comes back on undo", async () => {
    const shelf = await bin("Shelf", "SHELF1");
    const psu = await item({ name: "Bench PSU", code: "PSU0001", locationId: shelf.id });
    const { eventId } = await ok<{ eventId: number }>("DELETE", `/items/${psu.id}`);

    expect((await call("GET", `/items/${psu.id}`)).status).toBe(404);
    expect(await ok<ItemSummary[]>("GET", "/items?q=psu")).toEqual([]);
    expect((await ok<LocationDetail>("GET", `/locations/${shelf.id}`)).items).toEqual([]);
    expect(await ok<ScanResult>("GET", "/scan/PSU0001")).toMatchObject({ kind: "unassigned" });
    const events = await ok<EventView[]>("GET", "/events");
    expect(events[0]).toMatchObject({ type: "archive", itemId: psu.id, canUndo: true });

    const back = await ok<ItemDetail>("POST", `/events/${eventId}/undo`);
    expect(back.unitList[0]).toMatchObject({ code: "PSU0001", locationId: shelf.id });
    expect(await ok<ScanResult>("GET", "/scan/PSU0001")).toMatchObject({ kind: "unit", itemId: psu.id });
    expect(await ok<ItemSummary[]>("GET", "/items?q=psu")).toHaveLength(1);
  });

  it("lets the freed sticker go on something else; undo then restores the item without it", async () => {
    const shelf = await bin("Shelf");
    const old = await item({ name: "Old meter", code: "TOOL0001", locationId: shelf.id });
    const { eventId } = await ok<{ eventId: number }>("DELETE", `/items/${old.id}`);
    const fresh = await item({ name: "New meter", code: "TOOL0001", locationId: shelf.id });
    const back = await ok<ItemDetail>("POST", `/events/${eventId}/undo`);
    expect(back.unitList[0]!.code).toBeNull();
    expect(await ok<ScanResult>("GET", "/scan/TOOL0001")).toMatchObject({ kind: "unit", itemId: fresh.id });
  });
});

describe("quick capture", () => {
  it("turns an unassigned sticker into a returnable unit that needs details", async () => {
    const shelf = await bin("Shelf");
    const it1 = await item({ code: "HnVbi6RSP4ar", locationId: shelf.id });
    expect(it1).toMatchObject({ kind: "returnable", needsDetails: true, totalQty: 1 });
    expect(it1.unitList[0]?.code).toBe("HnVbi6RSP4ar");
    const scan = await ok<ScanResult>("GET", "/scan/HnVbi6RSP4ar");
    expect(scan).toMatchObject({ kind: "unit", itemId: it1.id });
  });

  it("captures a sticker-less consumable straight into a bin", async () => {
    const b = await bin("Bin 7", "BIN7");
    const screws = await item({ name: "M3 x 10mm socket cap", locationId: b.id, qty: 40 });
    expect(screws).toMatchObject({ kind: "consumable", tracking: "exact", totalQty: 40 });
    expect(screws.places[0]).toMatchObject({ locationId: b.id, qty: 40, isHome: true });
    const loc = await ok<LocationDetail>("GET", `/locations/${b.id}`);
    expect(loc.items).toEqual([expect.objectContaining({ itemId: screws.id, qty: 40 })]);
  });

  it("won't reuse a sticker that's on a location", async () => {
    await bin("Bin", "TAKEN1");
    const r = await call("POST", "/items", { code: "TAKEN1" });
    expect(r.status).toBe(409);
  });

  it("lists items needing details until they have a name and a category", async () => {
    const it1 = await item({});
    expect((await ok<{ needsDetails: number }>("GET", "/stats")).needsDetails).toBe(1);
    expect(await ok<ItemSummary[]>("GET", "/items?needs=1")).toHaveLength(1);
    // A name alone isn't enough (DEC-007, Q47).
    await ok("PATCH", `/items/${it1.id}`, { name: "Hot glue sticks" });
    expect(await ok<ItemSummary[]>("GET", "/items?needs=1")).toHaveLength(1);
    const cats = await ok<Category[]>("GET", "/categories");
    await ok("PATCH", `/items/${it1.id}`, { categoryId: cats[0]!.id });
    expect(await ok<ItemSummary[]>("GET", "/items?needs=1")).toHaveLength(0);
  });
});

describe("search", () => {
  it("matches word prefixes in any order across name, category and fields", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const fasteners = cats.find((c) => c.name === "Fasteners")!;
    const s = await item({ name: "Socket cap screw M3 x 10mm", categoryId: fasteners.id });
    await ok("PATCH", `/items/${s.id}`, { attributes: { thread: "M3", length: "10mm" } });
    await item({ name: "ESP32 dev board" });
    expect((await ok<ItemSummary[]>("GET", "/items?q=m3%2010")).map((i) => i.name)).toEqual(["Socket cap screw M3 x 10mm"]);
    expect((await ok<ItemSummary[]>("GET", "/items?q=fasten")).map((i) => i.id)).toEqual([s.id]);
    expect(await ok<ItemSummary[]>("GET", "/items?q=esp")).toHaveLength(1);
    expect(await ok<ItemSummary[]>("GET", "/items?q=resistor")).toHaveLength(0);
  });

  it("builds safe FTS queries from any input", () => {
    expect(ftsQuery('0.1uF "cap"')).toBe('"0"* "1uf"* "cap"*');
    expect(ftsQuery("  -- ")).toBeNull();
  });

  it("shows category defaults: fasteners are tracked by level", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const b = await bin("Bin");
    const nails = await item({ name: "Brad nails", categoryId: cats.find((c) => c.name === "Fasteners")!.id, locationId: b.id });
    expect(nails.tracking).toBe("level");
    expect(nails.places[0]?.level).toBe("plenty");
  });
});

describe("stock actions", () => {
  it("uses and adds with +/−, never below zero, and logs each change", async () => {
    const b = await bin("Bin");
    const s = await item({ name: "Screw", locationId: b.id, qty: 5 });
    expect((await adjust({ itemId: s.id, locationId: b.id, delta: -2 })).item.totalQty).toBe(3);
    const r = await adjust({ itemId: s.id, locationId: b.id, delta: -10 });
    expect(r.item.totalQty).toBe(0);
    const events = await ok<EventView[]>("GET", `/events?item=${s.id}`);
    expect(events.slice(0, 2).map((e) => [e.type, e.delta])).toEqual([["use", -3], ["use", -2]]);
  });

  it("undoes only the latest change", async () => {
    const b = await bin("Bin");
    const s = await item({ name: "Screw", locationId: b.id, qty: 5 });
    const first = await adjust({ itemId: s.id, locationId: b.id, delta: 1 });
    const second = await adjust({ itemId: s.id, locationId: b.id, delta: 1 });
    expect((await call("POST", `/events/${first.eventId}/undo`)).status).toBe(409);
    const undone = await ok<ItemDetail>("POST", `/events/${second.eventId}/undo`);
    expect(undone.totalQty).toBe(6);
    expect(undone.history.find((e) => e.id === second.eventId)?.undone).toBe(true);
    // Now the first one is the latest and can be undone.
    expect((await ok<ItemDetail>("POST", `/events/${first.eventId}/undo`)).totalQty).toBe(5);
  });

  it("sets plenty/low/out for level items and rejects +/−", async () => {
    const b = await bin("Bin");
    const nails = await item({ name: "Nails", locationId: b.id, level: "plenty" });
    expect((await adjust({ itemId: nails.id, locationId: b.id, level: "low" })).item.places[0]?.level).toBe("low");
    expect((await call("POST", "/stock/adjust", { itemId: nails.id, locationId: b.id, delta: 1 })).status).toBe(400);
  });

  it("needs a count before +/− on an uncounted item, and a recount clears staleness", async () => {
    const b = await bin("Bin");
    const s = await item({ name: "Resistor 10k", locationId: b.id });
    expect(s.places[0]?.qty).toBeNull();
    expect((await call("POST", "/stock/adjust", { itemId: s.id, locationId: b.id, delta: 1 })).status).toBe(400);
    await ok("POST", "/stock/recount", { itemId: s.id, locationId: b.id, qty: 100 });
    for (let i = 0; i < 10; i++) await adjust({ itemId: s.id, locationId: b.id, delta: -1 });
    const stale = await ok<ItemDetail>("GET", `/items/${s.id}`);
    expect(stale.places[0]).toMatchObject({ qty: 90, stale: true });
    const fresh = await ok<StockResult>("POST", "/stock/recount", { itemId: s.id, locationId: b.id, qty: 88 });
    expect(fresh.item.places[0]).toMatchObject({ qty: 88, stale: false });
  });

  it("adds an item to a second place with a recount", async () => {
    const [a, b2] = [await bin("A"), await bin("B")];
    const s = await item({ name: "Washer", locationId: a.id, qty: 10 });
    const r = await ok<StockResult>("POST", "/stock/recount", { itemId: s.id, locationId: b2.id, qty: 4 });
    expect(r.item.totalQty).toBe(14);
    expect(r.item.places.map((p) => p.isHome)).toEqual([true, false]);
  });

  it("moves part of the stock, then all of it (taking the home along), and undoes", async () => {
    const [a, b2] = [await bin("A"), await bin("B")];
    const s = await item({ name: "Nut", locationId: a.id, qty: 10 });
    const part = await ok<StockResult>("POST", "/stock/move", { itemId: s.id, fromLocationId: a.id, toLocationId: b2.id, qty: 3 });
    expect(part.item.places.map((p) => [p.locationId, p.qty, p.isHome])).toEqual([[a.id, 7, true], [b2.id, 3, false]]);
    const all = await ok<StockResult>("POST", "/stock/move", { itemId: s.id, fromLocationId: a.id, toLocationId: b2.id });
    expect(all.item.places.map((p) => [p.locationId, p.qty, p.isHome])).toEqual([[b2.id, 10, true]]);
    const undone = await ok<ItemDetail>("POST", `/events/${all.eventId}/undo`);
    expect(undone.places.map((p) => [p.locationId, p.qty, p.isHome])).toEqual([[a.id, 7, true], [b2.id, 3, false]]);
  });

  it("refuses to move more than is there", async () => {
    const [a, b2] = [await bin("A"), await bin("B")];
    const s = await item({ name: "Nut", locationId: a.id, qty: 2 });
    const r = await call("POST", "/stock/move", { itemId: s.id, fromLocationId: a.id, toLocationId: b2.id, qty: 5 });
    expect(r.status).toBe(400);
  });

  it("switching tracking mode converts the stock", async () => {
    const b = await bin("Bin");
    const s = await item({ name: "Zip ties", locationId: b.id, qty: 50 });
    const lvl = await ok<ItemDetail>("PATCH", `/items/${s.id}`, { tracking: "level" });
    expect(lvl.places[0]).toMatchObject({ qty: null, level: "plenty" });
  });
});

describe("units", () => {
  it("adds a second stickered unit and moves one, with undo", async () => {
    const [shelf, desk] = [await bin("Shelf"), await bin("Desk")];
    const psu = await item({ code: "PSU00000001", locationId: shelf.id });
    const added = await ok<StockResult>("POST", "/units", { itemId: psu.id, code: "PSU00000002", locationId: shelf.id });
    expect(added.item.totalQty).toBe(2);
    const unitId = added.item.unitList[1]!.id;
    const moved = await ok<StockResult>("POST", `/units/${unitId}/move`, { toLocationId: desk.id });
    expect(moved.item.places.map((p) => [p.path.at(-1)?.name, p.units])).toEqual([["Shelf", 1], ["Desk", 1]]);
    const undone = await ok<ItemDetail>("POST", `/events/${moved.eventId}/undo`);
    expect(undone.places.map((p) => p.units)).toEqual([2]);
  });
});

describe("photos", () => {
  it("stores an uploaded photo and thumbnail and serves them", async () => {
    const s = await item({});
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([0xff, 0xd8, 1, 2])], "p.jpg", { type: "image/jpeg" }));
    form.append("thumb", new File([new Uint8Array([0xff, 0xd8, 3])], "t.jpg", { type: "image/jpeg" }));
    const res = await api.request(`/items/${s.id}/photos`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const withPhoto = (await res.json()) as ItemDetail;
    expect(withPhoto.thumbUrl).toMatch(/-thumb\.jpg$/);
    const img = await api.request(withPhoto.photos[0]!.url.replace("/api", ""));
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 1, 2]));
    expect((await api.request("/photos/..%2Fapp.db")).status).toBe(404);
  });
});

describe("photo crops (DEC-030)", () => {
  it("saves a square crop with its new thumbnail, under a new name, and drops the old one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snt-photos-"));
    api = createApi(openDb(":memory:"), { photoDir: dir });
    const s = await item({ name: "JST lead" });
    const up = new FormData();
    up.append("photo", new File([new Uint8Array([0xff, 0xd8, 1])], "p.jpg", { type: "image/jpeg" }));
    up.append("thumb", new File([new Uint8Array([0xff, 0xd8, 2])], "t.jpg", { type: "image/jpeg" }));
    const withPhoto = (await (await api.request(`/items/${s.id}/photos`, { method: "POST", body: up })).json()) as ItemDetail;
    const photo = withPhoto.photos[0]!;
    expect(photo.crop).toBeNull();

    const crop = (body: Record<string, string | File>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(body)) f.append(k, v);
      return api.request(`/photos/${photo.id}/crop`, { method: "PUT", body: f });
    };
    const thumb = () => new File([new Uint8Array([0xff, 0xd8, 3])], "t.jpg", { type: "image/jpeg" });
    const res = await crop({ crop: JSON.stringify({ x: 0, y: 0.25, size: 1 }), thumb: thumb() });
    expect(res.status).toBe(200);
    const after = ((await res.json()) as ItemDetail).photos[0]!;
    expect(after.crop).toEqual({ x: 0, y: 0.25, size: 1 });
    expect(after.thumbUrl).not.toBe(photo.thumbUrl);
    expect(after.url).toBe(photo.url); // the original is untouched
    expect((await api.request(photo.thumbUrl.replace("/api", ""))).status).toBe(404);
    expect((await api.request(after.thumbUrl.replace("/api", ""))).status).toBe(200);
    expect(((await ok<ItemDetail>("GET", `/items/${s.id}`)).thumbUrl)).toBe(after.thumbUrl);

    expect((await crop({ crop: JSON.stringify({ x: 0, y: 0, size: 2 }), thumb: thumb() })).status).toBe(400);
    expect((await crop({ crop: "not json", thumb: thumb() })).status).toBe(400);
    expect((await crop({ crop: JSON.stringify({ x: 0, y: 0, size: 1 }) })).status).toBe(400);
    expect((await api.request(`/photos/999/crop`, { method: "PUT", body: (() => { const f = new FormData(); f.append("crop", JSON.stringify({ x: 0, y: 0, size: 1 })); f.append("thumb", thumb()); return f; })() })).status).toBe(404);
  });
});

describe("main photo and deleting photos (DEC-031)", () => {
  it("shows the oldest until another is made main, and deleting falls back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snt-photos-"));
    api = createApi(openDb(":memory:"), { photoDir: dir });
    const s = await item({ name: "JST lead" });
    const add = async () => {
      const f = new FormData();
      f.append("photo", new File([new Uint8Array([0xff, 0xd8, 1])], "p.jpg", { type: "image/jpeg" }));
      f.append("thumb", new File([new Uint8Array([0xff, 0xd8, 2])], "t.jpg", { type: "image/jpeg" }));
      return (await (await api.request(`/items/${s.id}/photos`, { method: "POST", body: f })).json()) as ItemDetail;
    };
    await add();
    const two = await add();
    const [first, second] = two.photos;
    expect([first!.main, second!.main]).toEqual([true, false]);
    expect(two.thumbUrl).toBe(first!.thumbUrl);

    const made = await ok<ItemDetail>("PUT", `/photos/${second!.id}/main`);
    expect(made.photos.map((p) => [p.id, p.main])).toEqual([[second!.id, true], [first!.id, false]]);
    expect(made.thumbUrl).toBe(second!.thumbUrl);
    const listed = (await ok<{ items: ItemSummary[] }>("GET", "/inventory")).items[0]!;
    expect(listed.thumbUrl).toBe(second!.thumbUrl);

    const after = await ok<ItemDetail>("DELETE", `/photos/${second!.id}`);
    expect(after.photos.map((p) => [p.id, p.main])).toEqual([[first!.id, true]]);
    expect((await api.request(second!.url.replace("/api", ""))).status).toBe(404);
    expect((await call("DELETE", `/photos/${second!.id}`)).status).toBe(404);
    const none = await ok<ItemDetail>("DELETE", `/photos/${first!.id}`);
    expect([none.photos.length, none.thumbUrl]).toEqual([0, null]);
  });
});

describe("bin tiles show a photo (DEC-036)", () => {
  it("gives a bin the photo of its first part that has one, and a box a photos/names setting", async () => {
    const box = await ok<LocationDetail>("POST", "/locations", { name: "Modules", type: "gridded_box", parentId: siteId });
    const b = await ok<LocationDetail>("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 0, y: 0 } });
    await item({ name: "Arduino Nano", locationId: b.id, qty: 2 });
    const esp = await item({ name: "ESP32", locationId: b.id, qty: 1 });
    const tile = async () => (await ok<LocationDetail>("GET", `/locations/${box.id}`)).children[0]!;
    expect((await tile()).thumbUrl).toBeNull();
    const f = new FormData();
    f.append("photo", new File([new Uint8Array([0xff, 0xd8, 1])], "p.jpg", { type: "image/jpeg" }));
    f.append("thumb", new File([new Uint8Array([0xff, 0xd8, 2])], "t.jpg", { type: "image/jpeg" }));
    const withPhoto = (await (await api.request(`/items/${esp.id}/photos`, { method: "POST", body: f })).json()) as ItemDetail;
    // Arduino Nano comes first but has no photo, so the tile uses ESP32's.
    expect([(await tile()).thumbUrl, (await tile()).thumbName]).toEqual([withPhoto.thumbUrl, "ESP32"]);
    expect((await ok<LocationDetail>("GET", `/locations/${b.id}`)).thumbUrl).toBe(withPhoto.thumbUrl);

    expect(box.tileView).toBe("photos");
    expect((await ok<LocationDetail>("PATCH", `/locations/${box.id}`, { tileView: "names" })).tileView).toBe("names");
    expect((await call("PATCH", `/locations/${box.id}`, { tileView: "pictures" })).status).toBe(400);
  });
});

describe("needs details", () => {
  it("skips the queue when created with a name and a category", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const full = await item({ name: "10k resistor", categoryId: cats[0]!.id });
    const nameOnly = await item({ name: "Something" });
    expect([full.needsDetails, nameOnly.needsDetails]).toEqual([false, true]);
  });

  it("lists the parts to fill in, oldest first, with their category and places (DEC-037)", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const b = await bin("Bin 7");
    const first = await item({ locationId: b.id, qty: 3 });
    const second = await item({ name: "Glue", locationId: b.id });
    await item({ name: "Done already", categoryId: cats[0]!.id });
    const list = await ok<ItemDetail[]>("GET", "/items/needs-details");
    expect(list.map((i) => i.id)).toEqual([first.id, second.id]);
    expect(list[0]).toMatchObject({ categoryId: null, places: [expect.objectContaining({ locationId: b.id, qty: 3 })] });

    // Picking a category for a part that has a name takes it off; the list skips it from then on.
    const done = await ok<ItemDetail>("PATCH", `/items/${second.id}`, { categoryId: cats[1]!.id });
    expect(done).toMatchObject({ needsDetails: false, categoryId: cats[1]!.id });
    expect((await ok<ItemSummary[]>("GET", "/items/needs-details")).map((i) => i.id)).toEqual([first.id]);

    // Taking the category away puts it back; saying so keeps a complete part on the list.
    expect((await ok<ItemDetail>("PATCH", `/items/${second.id}`, { categoryId: null })).needsDetails).toBe(true);
    const kept = await ok<ItemDetail>("PATCH", `/items/${second.id}`, { categoryId: cats[1]!.id, needsDetails: true });
    expect(kept.needsDetails).toBe(true);
  });
});

describe("pins", () => {
  it("pins parts and containers, newest first, and unpins", async () => {
    const b = await bin("Bin 7");
    const s = await item({ name: "M3 screw", locationId: b.id, qty: 10 });
    const r = await item({ name: "10k resistor", locationId: b.id, qty: 5 });
    await ok("PUT", `/pins/item/${s.id}`);
    await ok("PUT", `/pins/location/${b.id}`);
    const pins = await ok<{ items: ItemSummary[]; locations: { id: number; path: { name: string }[] }[] }>("PUT", `/pins/item/${r.id}`);
    expect(pins.items.map((i) => i.name)).toEqual(["10k resistor", "M3 screw"]);
    expect(pins.locations.map((l) => l.path.map((c) => c.name))).toEqual([["Garage", "Bin 7"]]);
    expect((await ok<ItemDetail>("GET", `/items/${s.id}`)).pinned).toBe(true);
    expect((await ok<LocationDetail>("GET", `/locations/${b.id}`)).pinned).toBe(true);

    await ok("PUT", `/pins/item/${s.id}`); // pinning twice is harmless
    const after = await ok<{ items: ItemSummary[] }>("DELETE", `/pins/item/${s.id}`);
    expect(after.items.map((i) => i.name)).toEqual(["10k resistor"]);
    expect((await call("PUT", "/pins/item/999")).status).toBe(404);
  });
});

describe("inventory", () => {
  const names = (r: Inventory) => [r.pinned.map((i) => i.name), r.items.map((i) => i.name)];

  it("lists everything A to Z, unnamed last, with pinned parts on top and not repeated", async () => {
    const b = await bin("Bin");
    const zip = await item({ name: "zip ties", locationId: b.id, qty: 5 });
    await item({ name: "Anchors", locationId: b.id, qty: 5 });
    await item({});
    await item({ name: "M3 screw", locationId: b.id, qty: 5 });
    expect(names(await ok<Inventory>("GET", "/inventory"))).toEqual([[], ["Anchors", "M3 screw", "zip ties", ""]]);

    await ok("PUT", `/pins/item/${zip.id}`);
    const r = await ok<Inventory>("GET", "/inventory");
    expect(names(r)).toEqual([["zip ties"], ["Anchors", "M3 screw", ""]]);
    expect([r.total, r.next]).toEqual([4, null]);
    // A pinned part that doesn't pass the filter isn't shown.
    expect(names(await ok<Inventory>("GET", "/inventory?q=m3"))).toEqual([[], ["M3 screw"]]);
  });

  it("pages through the rest, with pinned parts only on the first page", async () => {
    for (const n of ["A", "B", "C", "D", "E"]) await item({ name: n });
    const pinned = await item({ name: "P" });
    await ok("PUT", `/pins/item/${pinned.id}`);
    const p1 = await ok<Inventory>("GET", "/inventory?limit=2");
    expect([...names(p1), p1.total, p1.next]).toEqual([["P"], ["A", "B"], 6, 2]);
    const p2 = await ok<Inventory>("GET", `/inventory?limit=2&offset=${p1.next}`);
    expect([...names(p2), p2.next]).toEqual([[], ["C", "D"], 4]);
    const p3 = await ok<Inventory>("GET", `/inventory?limit=2&offset=${p2.next}`);
    expect([...names(p3), p3.next]).toEqual([[], ["E"], null]);
  });

  it("filters by category, kind, needs details, low and checked out", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const [c1, c2] = [cats[0]!, cats[1]!];
    const b = await bin("Bin");
    await item({ name: "Washer", categoryId: c1.id, locationId: b.id, qty: 0 });
    await item({ name: "Tape", categoryId: c2.id, locationId: b.id, tracking: "level", level: "plenty" });
    const psu = await item({ name: "PSU", kind: "returnable", code: "PSU1", locationId: b.id });
    await item({});
    await ok("POST", `/units/${psu.unitList[0]!.id}/checkout`, { note: "lent to Sam" });

    const get = async (qs: string) => (await ok<Inventory>("GET", `/inventory?${qs}`)).items.map((i) => i.name);
    expect(await get(`cat=${c1.id}`)).toEqual(["Washer"]);
    expect(await get("cat=none")).toEqual(["PSU", ""]);
    expect(await get("kind=returnable")).toEqual(["PSU"]);
    expect(await get("needs=1")).toEqual(["PSU", ""]);
    expect(await get("low=1")).toEqual(["Washer"]);
    expect(await get("out=1")).toEqual(["PSU"]);
    expect(await get("stale=1")).toEqual([]);
    expect(await get("needs=1&kind=returnable")).toEqual(["PSU"]);
    expect((await call("GET", "/inventory?cat=abc")).status).toBe(400);
  });

  it("puts best matches first when searching, unless a sort is picked", async () => {
    await item({ name: "M3 screw" });
    await item({ name: "Washer for M3 bolts" });
    const order = async (qs: string) => (await ok<Inventory>("GET", `/inventory?${qs}`)).items.map((i) => i.name);
    expect(await order("q=m3")).toEqual(["M3 screw", "Washer for M3 bolts"]);
    expect(await order("q=m3&sort=added")).toEqual(["Washer for M3 bolts", "M3 screw"]);
  });
});
