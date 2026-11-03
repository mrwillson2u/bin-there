import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { purgeOldDeletions } from "./housekeeping";
import type { EventView, ItemDetail, ItemSummary, LocationDetail, ScanResult } from "../shared/api";

describe("purging old deletions", () => {
  it("removes items deleted over 30 days ago, with their photos, stock, units and history; keeps the rest", async () => {
    const db = openDb(":memory:");
    const photoDir = mkdtempSync(join(tmpdir(), "snt-photos-"));
    const api = createApi(db, { photoDir });
    const ok = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await api.request(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const json = (await res.json()) as T;
      if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status}`);
      return json;
    };
    const site = await ok<LocationDetail>("POST", "/locations", { name: "Garage", type: "site" });
    const shelf = await ok<LocationDetail>("POST", "/locations", { name: "Shelf", type: "shelf", parentId: site.id });
    const gone = await ok<ItemDetail>("POST", "/items", { name: "Mistake", locationId: shelf.id, qty: 3, code: "GONE01" });
    const recent = await ok<ItemDetail>("POST", "/items", { name: "Recent mistake", locationId: shelf.id, qty: 1 });
    const kept = await ok<ItemDetail>("POST", "/items", { name: "Keeper", locationId: shelf.id, qty: 7 });
    // A photo on the item to be purged, and one on the keeper.
    for (const [id, name] of [[gone.id, "gone"], [kept.id, "kept"]] as const) {
      for (const f of [`${name}.jpg`, `${name}-thumb.jpg`]) writeFileSync(join(photoDir, f), "x");
      db.$client.prepare("insert into photos (item_id, path, thumb_path) values (?, ?, ?)").run(id, `${name}.jpg`, `${name}-thumb.jpg`);
    }
    await ok("DELETE", `/items/${gone.id}`);
    await ok("DELETE", `/items/${recent.id}`);
    db.$client.prepare("update items set updated_at = datetime('now', '-40 days') where id = ?").run(gone.id);

    expect(await purgeOldDeletions(db, photoDir)).toBe(1);

    expect(db.$client.prepare("select count(*) as n from items where id = ?").get(gone.id)).toEqual({ n: 0 });
    expect(db.$client.prepare("select count(*) as n from events where item_id = ?").get(gone.id)).toEqual({ n: 0 });
    expect(db.$client.prepare("select count(*) as n from units where item_id = ?").get(gone.id)).toEqual({ n: 0 });
    expect(db.$client.prepare("select count(*) as n from stock where item_id = ?").get(gone.id)).toEqual({ n: 0 });
    expect(existsSync(join(photoDir, "gone.jpg"))).toBe(false);
    expect(existsSync(join(photoDir, "gone-thumb.jpg"))).toBe(false);
    expect(existsSync(join(photoDir, "kept.jpg"))).toBe(true);
    // The freed sticker stays free; the keeper and the recent deletion are untouched.
    expect(await ok<ScanResult>("GET", "/scan/GONE01")).toMatchObject({ kind: "unassigned" });
    expect((await ok<ItemDetail>("GET", `/items/${kept.id}`)).photos).toHaveLength(1);
    expect(db.$client.prepare("select archived from items where id = ?").get(recent.id)).toEqual({ archived: 1 });
    const events = await ok<EventView[]>("GET", "/events");
    expect(events.some((e) => e.itemId === recent.id && e.type === "archive")).toBe(true);
    expect(events.some((e) => e.itemId === gone.id)).toBe(false);
    expect((await ok<ItemSummary[]>("GET", "/items")).map((i) => i.name)).toEqual(["Keeper"]);
    // Nothing left to purge.
    expect(await purgeOldDeletions(db, photoDir)).toBe(0);
  });
});
