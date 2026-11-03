import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import type { ItemDetail, LocationDetail, ProjectSummary, ReturnResult, StockResult } from "../shared/api";

let api: ReturnType<typeof createApi>;
let siteId: number;

beforeEach(async () => {
  api = createApi(openDb(":memory:"), { photoDir: mkdtempSync(join(tmpdir(), "snt-photos-")) });
  siteId = (await ok<LocationDetail>("POST", "/locations", { name: "Garage", type: "site" })).id;
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await api.request(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}
const ok = async <T>(method: string, path: string, body?: unknown) => {
  const r = await call<T>(method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const loc = (name: string, type = "bin") => ok<LocationDetail>("POST", "/locations", { name, type, parentId: siteId });
const item = (body: object) => ok<ItemDetail>("POST", "/items", body);
const getItem = (id: number) => ok<ItemDetail>("GET", `/items/${id}`);
const placeIds = (i: ItemDetail) => i.places.map((p) => [p.locationId, p.qty ?? p.level, p.isHome]);

describe("project kits", () => {
  it("pulling everything into a kit keeps the home; return sends it back; finish deletes the empty kit", async () => {
    const bin = await loc("Bin 7");
    const kit = await loc("Weather station", "project");
    const screws = await item({ name: "M3 x 10", locationId: bin.id, qty: 40 });

    // Pull all 40 into the kit: the bin stays home (a normal move would have moved it).
    await ok<StockResult>("POST", "/stock/move", { itemId: screws.id, fromLocationId: bin.id, toLocationId: kit.id });
    let s = await getItem(screws.id);
    expect(placeIds(s)).toEqual([[bin.id, null, true], [kit.id, 40, false]]);
    expect(s.totalQty).toBe(40);

    const projects = await ok<ProjectSummary[]>("GET", "/projects");
    expect(projects).toMatchObject([{ id: kit.id, name: "Weather station", items: 1 }]);

    // Use some, then finish: the rest goes home and the kit is gone.
    await ok<StockResult>("POST", "/stock/adjust", { itemId: screws.id, locationId: kit.id, delta: -6 });
    const r = await ok<ReturnResult>("POST", `/projects/${kit.id}/return`, { finish: true });
    expect(r).toEqual({ returned: 1, left: [], finished: true });
    s = await getItem(screws.id);
    expect(placeIds(s)).toEqual([[bin.id, 34, true]]);
    expect(s.history[0]).toMatchObject({ type: "move", canUndo: true });
    expect((await call("GET", `/locations/${kit.id}`)).status).toBe(404);
    expect(await ok<ProjectSummary[]>("GET", "/projects")).toEqual([]);
  });

  it("returns stickered units to their own home, whether checked out or moved; a kit is never a home", async () => {
    const shelf = await loc("PSU shelf", "shelf");
    const kit = await loc("Robot", "project");
    const psu = await item({ name: "12 V supply", locationId: shelf.id, code: "PSU0001" });
    await ok<StockResult>("POST", "/units", { itemId: psu.id, code: "PSU0002", locationId: shelf.id });
    const [u1, u2] = (await getItem(psu.id)).unitList;
    await ok<StockResult>("POST", `/units/${u1!.id}/checkout`, { toLocationId: kit.id });
    await ok<StockResult>("POST", `/units/${u2!.id}/move`, { toLocationId: kit.id });
    // A unit stickered straight into the kit has no home of its own; the item's home covers it.
    await ok<StockResult>("POST", "/units", { itemId: psu.id, code: "PSU0003", locationId: kit.id });
    let p = await getItem(psu.id);
    expect(p.unitList.map((u) => [u.code, u.locationId, u.homeLocationId])).toEqual([
      ["PSU0001", kit.id, shelf.id],
      ["PSU0002", kit.id, shelf.id],
      ["PSU0003", kit.id, null],
    ]);
    expect((await ok<ProjectSummary[]>("GET", "/projects"))[0]!.items).toBe(1);

    const r = await ok<ReturnResult>("POST", `/projects/${kit.id}/return`);
    expect(r).toMatchObject({ returned: 3, left: [], finished: false });
    p = await getItem(psu.id);
    expect(p.unitList.every((u) => u.locationId === shelf.id && u.out === null)).toBe(true);
    expect(p.checkedOut).toBe(0);
    // The kit survives a plain return (shelved project, emptied for now).
    expect((await call("GET", `/locations/${kit.id}`)).status).toBe(200);
  });

  it("leaves things with no home, reports them, and won't finish; a single item can be returned alone", async () => {
    const bin = await loc("Bin 1");
    const kit = await loc("Clock", "project");
    const caps = await item({ name: "100nF", locationId: bin.id, qty: 10 });
    const mystery = await item({ name: "Mystery board", locationId: kit.id, qty: 1 }); // created in the kit: no home
    await ok<StockResult>("POST", "/stock/move", { itemId: caps.id, fromLocationId: bin.id, toLocationId: kit.id, qty: 4 });
    expect((await getItem(mystery.id)).places).toEqual([expect.objectContaining({ locationId: kit.id, isHome: false })]);
    // Put-back into a kit doesn't make it the home either.
    await ok<StockResult>("POST", "/putback", { itemId: mystery.id, locationId: kit.id, qty: 1 });
    expect((await getItem(mystery.id)).places[0]!.isHome).toBe(false);

    const one = await ok<ReturnResult>("POST", `/projects/${kit.id}/return`, { itemId: caps.id });
    expect(one).toEqual({ returned: 1, left: [], finished: false });
    expect(placeIds(await getItem(caps.id))).toEqual([[bin.id, 10, true]]);

    const all = await ok<ReturnResult>("POST", `/projects/${kit.id}/return`, { finish: true });
    expect(all).toEqual({ returned: 0, left: [{ itemId: mystery.id, name: "Mystery board", reason: "has no home yet" }], finished: false });
    expect((await call("GET", `/locations/${kit.id}`)).status).toBe(200);

    expect((await call("POST", `/locations/${bin.id}/return`, {})).status).toBe(404); // no such route for a bin
    expect((await call("POST", `/projects/${bin.id}/return`, {})).status).toBe(400);
  });
});
