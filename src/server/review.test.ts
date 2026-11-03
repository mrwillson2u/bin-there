import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import type { ItemDetail, ItemSummary, LocationDetail, ReviewEntry, Stats, StockResult } from "../shared/api";

let db: ReturnType<typeof openDb>;
let api: ReturnType<typeof createApi>;
let siteId: number;

beforeEach(async () => {
  db = openDb(":memory:");
  api = createApi(db, { photoDir: mkdtempSync(join(tmpdir(), "snt-photos-")) });
  siteId = (await ok<LocationDetail>("POST", "/locations", { name: "Garage", type: "site" })).id;
});

async function ok<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await api.request(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as T;
  if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const bin = (name: string) => ok<LocationDetail>("POST", "/locations", { name, type: "tote", parentId: siteId });
const item = (body: Record<string, unknown>) => ok<ItemDetail>("POST", "/items", body);
const backdate = (itemId: number, days: number) =>
  db.$client.prepare("update stock set last_counted_at = datetime('now', ?) where item_id = ?").run(`-${days} days`, itemId);

describe("staleness review", () => {
  it("lists old or much-changed exact counts in walking order, and a recount clears them", async () => {
    const a = await bin("Tote A");
    const b = await bin("Tote B");
    const old = await item({ name: "Old count", locationId: a.id, qty: 40 });
    const fresh = await item({ name: "Fresh count", locationId: b.id, qty: 5 });
    const busy = await item({ name: "Busy count", locationId: b.id, qty: 100 });
    const level = await item({ name: "Nails", locationId: a.id, level: "plenty" });
    backdate(old.id, 120);
    backdate(level.id, 120); // level items never go stale
    for (let i = 0; i < 10; i++) await ok<StockResult>("POST", "/stock/adjust", { itemId: busy.id, locationId: b.id, delta: -1 });

    const review = await ok<ReviewEntry[]>("GET", "/review");
    expect(review.map((r) => [r.name, r.path.at(-1)?.name, r.qty])).toEqual([
      ["Old count", "Tote A", 40],
      ["Busy count", "Tote B", 90],
    ]);
    expect(review[1]!.changesSinceCount).toBe(10);
    expect((await ok<Stats>("GET", "/stats")).stale).toBe(2);

    // "Still 40" is a recount at the same number: freshness resets, nothing else changes.
    const r = await ok<StockResult>("POST", "/stock/recount", { itemId: old.id, locationId: a.id, qty: 40 });
    expect(r.item.places[0]).toMatchObject({ qty: 40, stale: false });
    expect(r.item.history[0]).toMatchObject({ type: "recount", delta: 0 });
    expect((await ok<ReviewEntry[]>("GET", "/review")).map((x) => x.name)).toEqual(["Busy count"]);
    expect(fresh.places[0]!.stale).toBe(false);
  });
});

describe("low stock", () => {
  it("lists level items that are low or out and exact items at zero or under their threshold, worst first", async () => {
    const t = await bin("Tote");
    const screws = await item({ name: "Wood screws", locationId: t.id, level: "low" });
    const glue = await item({ name: "Glue", locationId: t.id, level: "out" });
    await item({ name: "Nails", locationId: t.id, level: "plenty" });
    const caps = await item({ name: "100nF caps", locationId: t.id, qty: 12 });
    const leds = await item({ name: "Red LEDs", locationId: t.id, qty: 0 });
    await item({ name: "Resistors", locationId: t.id, qty: 500 });
    const uncounted = await item({ name: "Mystery", locationId: t.id });

    // Nothing has a threshold yet: only the level items and the zero count show.
    let low = await ok<ItemSummary[]>("GET", "/items/low");
    expect(low.map((i) => i.name)).toEqual(["Glue", "Red LEDs", "Wood screws"]);

    // A threshold puts the caps on the list once the total is at or below it.
    const patched = await ok<ItemDetail>("PATCH", `/items/${caps.id}`, { lowThreshold: 20 });
    expect(patched.lowThreshold).toBe(20);
    low = await ok<ItemSummary[]>("GET", "/items/low");
    expect(low.map((i) => i.name)).toEqual(["Glue", "Red LEDs", "100nF caps", "Wood screws"]);
    await ok<ItemDetail>("PATCH", `/items/${caps.id}`, { lowThreshold: 10 });
    expect((await ok<ItemSummary[]>("GET", "/items/low")).map((i) => i.name)).not.toContain("100nF caps");
    // An uncounted item with a threshold isn't low: there's nothing to compare.
    await ok<ItemDetail>("PATCH", `/items/${uncounted.id}`, { lowThreshold: 5 });
    expect((await ok<ItemSummary[]>("GET", "/items/low")).map((i) => i.name)).not.toContain("Mystery");

    expect((await ok<Stats>("GET", "/stats")).low).toBe(3);
    // Restocking takes things off the list.
    await ok<StockResult>("POST", "/stock/adjust", { itemId: glue.id, locationId: t.id, level: "plenty" });
    await ok<StockResult>("POST", "/stock/adjust", { itemId: leds.id, locationId: t.id, delta: 50 });
    expect((await ok<ItemSummary[]>("GET", "/items/low")).map((i) => i.id)).toEqual([screws.id]);
  });
});
