import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { ftsQuery } from "./items";
import type { BulkResult, Category, EventView, Inventory, ItemDetail, ItemSummary, LocationDetail, ScanResult, StockResult } from "../shared/api";

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

describe("categories (DEC-056)", () => {
  it("renames a field keeping its key and the parts' values, adds and removes fields, and counts usage", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const wire = cats.find((c) => c.name === "Wire & connectors")!;
    const gauge = wire.fieldDefs.find((f) => f.label === "Gauge")!;
    const plug = await item({ name: "DC plug", categoryId: wire.id });
    await ok("PATCH", `/items/${plug.id}`, { attributes: { [gauge.key]: "20 AWG" } });
    // Rename Gauge to Wire gauge, drop Type, add Pins: the key behind Gauge stays, so the value stays.
    const updated = await ok<Category>("PATCH", `/categories/${wire.id}`, { fieldDefs: [{ key: gauge.key, label: "Wire gauge" }, { label: "Pins" }] });
    expect(updated.fieldDefs.map((f) => [f.key, f.label])).toEqual([[gauge.key, "Wire gauge"], ["pins", "Pins"]]);
    const after = await ok<ItemDetail>("GET", `/items/${plug.id}`);
    expect(after.fieldDefs.map((f) => f.label)).toEqual(["Wire gauge", "Pins"]);
    expect(after.attributes[gauge.key]).toBe("20 AWG");
    // Usage: one part in it, one holding a value in the renamed field, none in the new one.
    const usage = await ok<Record<number, { items: number; fields: Record<string, number> }>>("GET", "/categories/usage");
    expect(usage[wire.id]).toEqual({ items: 1, fields: { [gauge.key]: 1, pins: 0 } });
    // A new field with a label that collides on key gets a numbered key; a name clash is refused.
    const more = await ok<Category>("PATCH", `/categories/${wire.id}`, { fieldDefs: [{ key: gauge.key, label: "Wire gauge" }, { key: "pins", label: "Pins" }, { label: "Pins" }] });
    expect(more.fieldDefs.map((f) => f.key)).toEqual([gauge.key, "pins", "pins_2"]);
    expect((await call("PATCH", `/categories/${wire.id}`, { name: "fasteners" })).status).toBe(409);
    // The renamed field's label is searchable.
    expect((await ok<{ id: number }[]>("GET", "/items?q=wire+gauge")).map((i) => i.id)).toContain(plug.id);
  });

  it("makes a field a choice with options, kept once each, and back to text (DEC-059)", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const wire = cats.find((c) => c.name === "Wire & connectors")!;
    const [gauge, type] = wire.fieldDefs;
    const choice = await ok<Category>("PATCH", `/categories/${wire.id}`, {
      fieldDefs: [{ key: gauge!.key, label: gauge!.label }, { key: type!.key, label: "Connector", type: "choice", options: ["JST", "USB-C", "JST"] }],
    });
    expect(choice.fieldDefs[1]).toEqual({ key: type!.key, label: "Connector", type: "choice", options: ["JST", "USB-C"] });
    expect(choice.fieldDefs[0]!.type).toBe("text");
    // Left out, the type and options stay; back to text, the options go.
    const same = await ok<Category>("PATCH", `/categories/${wire.id}`, { fieldDefs: [{ key: gauge!.key, label: gauge!.label }, { key: type!.key, label: "Connector" }] });
    expect(same.fieldDefs[1]!.options).toEqual(["JST", "USB-C"]);
    const text = await ok<Category>("PATCH", `/categories/${wire.id}`, { fieldDefs: [{ key: gauge!.key, label: gauge!.label }, { key: type!.key, label: "Connector", type: "text" }] });
    expect(text.fieldDefs[1]).toEqual({ key: type!.key, label: "Connector", type: "text" });
  });

  it("lists the values a category's parts already hold, most used first, text fields only (DEC-060)", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const wire = cats.find((c) => c.name === "Wire & connectors")!;
    const [gauge, type] = wire.fieldDefs;
    await ok("PATCH", `/categories/${wire.id}`, { fieldDefs: [{ key: gauge!.key, label: "Gauge" }, { key: type!.key, label: "Type", type: "choice", options: ["JST"] }] });
    for (const [g, t] of [["22 AWG", "JST"], ["20 AWG", "JST"], ["22 AWG", ""], [" ", "JST"]]) {
      const i = await item({ name: "Wire", categoryId: wire.id });
      await ok("PATCH", `/items/${i.id}`, { attributes: { [gauge!.key]: g, [type!.key]: t } });
    }
    const gone = await item({ name: "Old wire", categoryId: wire.id });
    await ok("PATCH", `/items/${gone.id}`, { attributes: { [gauge!.key]: "30 AWG" } });
    await ok("DELETE", `/items/${gone.id}`);
    expect(await ok<Record<string, string[]>>("GET", `/categories/${wire.id}/values`)).toEqual({ [gauge!.key]: ["22 AWG", "20 AWG"] });
    expect((await call("GET", "/categories/9999/values")).status).toBe(404);
  });

  it("deletes an unused category, and refuses while parts use one", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const fasteners = cats.find((c) => c.name === "Fasteners")!;
    const screw = await item({ name: "Screw", categoryId: fasteners.id });
    const refused = await call<{ error: { message: string } }>("DELETE", `/categories/${fasteners.id}`);
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toBe("1 part uses this category; move them first");
    await ok("PATCH", `/items/${screw.id}`, { categoryId: null });
    expect((await call("DELETE", `/categories/${fasteners.id}`)).status).toBe(200);
    expect((await ok<Category[]>("GET", "/categories")).some((c) => c.id === fasteners.id)).toBe(false);
    expect((await call("DELETE", `/categories/${fasteners.id}`)).status).toBe(404);
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

describe("bulk editing (DEC-057)", () => {
  it("applies one change to each checked part, reporting the ones that couldn't take it", async () => {
    const cats = await ok<Category[]>("GET", "/categories");
    const fasteners = cats.find((c) => c.name === "Fasteners")!;
    const a = await item({ name: "M3 screw" });
    const b = await item({ name: "M4 screw" });
    const r = await ok<BulkResult>("POST", "/items/bulk", { ids: [a.id, b.id, 9999], action: { type: "category", categoryId: fasteners.id } });
    expect(r.done).toBe(2);
    expect(r.failed).toEqual([{ id: 9999, name: null, message: "No item 9999" }]);
    expect((await ok<ItemDetail>("GET", `/items/${a.id}`)).categoryName).toBe("Fasteners");
    // The way of counting, converting the stock; and delete.
    const shelf = await bin("Shelf");
    await adjust({ itemId: a.id, locationId: shelf.id, delta: 5 });
    await ok<BulkResult>("POST", "/items/bulk", { ids: [a.id], action: { type: "tracking", tracking: "level" } });
    expect((await ok<ItemDetail>("GET", `/items/${a.id}`)).places[0]).toMatchObject({ qty: null, level: "plenty" });
    const gone = await ok<BulkResult>("POST", "/items/bulk", { ids: [a.id, b.id], action: { type: "delete" } });
    expect(gone.done).toBe(2);
    expect((await call("GET", `/items/${a.id}`)).status).toBe(404);
  });

  it("moves everything a part has to one place, with one undoable entry per part", async () => {
    const [here, there, desk, tote] = [await bin("Here"), await bin("There"), await bin("Desk"), await bin("Tote")];
    // A counted part in two bins.
    const screws = await item({ name: "Screws", locationId: here.id, qty: 10 });
    await ok("POST", "/stock/recount", { itemId: screws.id, locationId: there.id, qty: 5 });
    // A stickered part: one unit at home, one checked out to the desk.
    const psu = await item({ name: "PSU", kind: "returnable", code: "PSU00000001", locationId: here.id });
    const second = await ok<StockResult>("POST", "/units", { itemId: psu.id, code: "PSU00000002", locationId: here.id });
    const outId = second.item.unitList[1]!.id;
    await ok("POST", `/units/${outId}/checkout`, { toLocationId: desk.id });
    // A part with no place at all.
    const loose = await item({ name: "Loose" });

    const r = await ok<BulkResult>("POST", "/items/bulk", { ids: [screws.id, psu.id, loose.id], action: { type: "move", locationId: tote.id } });
    expect(r).toEqual({ done: 3, failed: [] });
    const s = await ok<ItemDetail>("GET", `/items/${screws.id}`);
    expect(s.places.map((p) => [p.path.at(-1)?.name, p.qty, p.isHome])).toEqual([["Tote", 15, true]]);
    const u = await ok<ItemDetail>("GET", `/items/${psu.id}`);
    expect(u.unitList.map((x) => [x.locationId, x.homeLocationId, !!x.out])).toEqual([[tote.id, tote.id, false], [desk.id, tote.id, true]]);
    expect(u.places.find((p) => p.locationId === tote.id)).toMatchObject({ units: 1, isHome: true });
    const l = await ok<ItemDetail>("GET", `/items/${loose.id}`);
    expect(l.places.map((p) => [p.path.at(-1)?.name, p.qty])).toEqual([["Tote", null]]);
    // Checking the outing in brings the unit back to its new home.
    const back = await ok<StockResult>("POST", `/units/${outId}/checkin`, {});
    expect(back.item.unitList.map((x) => x.locationId)).toEqual([tote.id, tote.id]);

    // Already there: nothing recorded, no error.
    const again = await ok<BulkResult>("POST", "/items/bulk", { ids: [screws.id], action: { type: "move", locationId: tote.id } });
    expect(again.done).toBe(1);
    expect((await ok<ItemDetail>("GET", `/items/${screws.id}`)).history.filter((e) => e.type === "move")).toHaveLength(1);

    // Undo puts the screws back in both bins with their counts and their home.
    const moveEvent = s.history.find((e) => e.type === "move")!;
    expect(moveEvent).toMatchObject({ delta: 15, to: "Garage › Tote", canUndo: true });
    const undone = await ok<ItemDetail>("POST", `/events/${moveEvent.id}/undo`);
    expect(undone.places.map((p) => [p.path.at(-1)?.name, p.qty, p.isHome]).sort()).toEqual([["Here", 10, true], ["There", 5, false]]);
    // And the units' places and homes (the check-in came after the move, so undo it first).
    const uHist = (await ok<ItemDetail>("GET", `/items/${psu.id}`)).history;
    await ok("POST", `/events/${uHist.find((e) => e.type === "check_in")!.id}/undo`);
    const uUndone = await ok<ItemDetail>("POST", `/events/${uHist.find((e) => e.type === "move")!.id}/undo`);
    expect(uUndone.unitList.map((x) => [x.locationId, x.homeLocationId])).toEqual([[here.id, here.id], [desk.id, here.id]]);
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
    expect((await tile()).thumbs).toEqual([{ url: withPhoto.thumbUrl, name: "ESP32" }]);
    // Every part with a photo is listed, A to Z, so a bigger tile can show them side by side (DEC-041).
    const nano = (await ok<ItemDetail[]>("GET", "/items?q=Arduino"))[0]!;
    const g = new FormData();
    g.append("photo", new File([new Uint8Array([0xff, 0xd8, 3])], "p.jpg", { type: "image/jpeg" }));
    g.append("thumb", new File([new Uint8Array([0xff, 0xd8, 4])], "t.jpg", { type: "image/jpeg" }));
    const nanoPhoto = (await (await api.request(`/items/${nano.id}/photos`, { method: "POST", body: g })).json()) as ItemDetail;
    expect((await tile()).thumbs.map((t) => t.name)).toEqual(["Arduino Nano", "ESP32"]);
    expect([(await tile()).thumbUrl, (await tile()).thumbs[0]!.url]).toEqual([nanoPhoto.thumbUrl, nanoPhoto.thumbUrl]);

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
