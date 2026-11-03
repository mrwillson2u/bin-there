import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { ftsQuery } from "./items";
import type { Category, EventView, ItemDetail, ItemSummary, LocationDetail, ScanResult, StockResult } from "../shared/api";

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

const bin = (name: string, code?: string) => ok<LocationDetail>("POST", "/locations", { name, type: "bin", code });
const item = (body: object) => ok<ItemDetail>("POST", "/items", body);
const adjust = (body: object) => ok<StockResult>("POST", "/stock/adjust", body);

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

  it("lists items needing details until the details form is saved", async () => {
    const it1 = await item({});
    expect((await ok<{ needsDetails: number }>("GET", "/stats")).needsDetails).toBe(1);
    expect(await ok<ItemSummary[]>("GET", "/items?needs=1")).toHaveLength(1);
    await ok("PATCH", `/items/${it1.id}`, { name: "Hot glue sticks" });
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

describe("needs details", () => {
  it("skips the queue when created with a name and a category", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const full = await item({ name: "10k resistor", categoryId: cats[0]!.id });
    const nameOnly = await item({ name: "Something" });
    expect([full.needsDetails, nameOnly.needsDetails]).toEqual([false, true]);
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
    expect(pins.locations.map((l) => l.path.map((c) => c.name))).toEqual([["Bin 7"]]);
    expect((await ok<ItemDetail>("GET", `/items/${s.id}`)).pinned).toBe(true);
    expect((await ok<LocationDetail>("GET", `/locations/${b.id}`)).pinned).toBe(true);

    await ok("PUT", `/pins/item/${s.id}`); // pinning twice is harmless
    const after = await ok<{ items: ItemSummary[] }>("DELETE", `/pins/item/${s.id}`);
    expect(after.items.map((i) => i.name)).toEqual(["10k resistor"]);
    expect((await call("PUT", "/pins/item/999")).status).toBe(404);
  });
});
