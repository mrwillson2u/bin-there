import { mkdtempSync, readdirSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { msUntilHour, runBackup } from "./backup";
import type { BackupInfo, ItemDetail, LocationDetail, LocationSummary, StockResult } from "../shared/api";

let api: ReturnType<typeof createApi>;
let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "snt-"));
  db = openDb(join(dir, "app.db"));
  api = createApi(db, { photoDir: join(dir, "photos"), backup: { backupDir: join(dir, "backup"), photoDir: join(dir, "photos"), keep: 2 } });
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
const bin = (name: string) => ok<LocationDetail>("POST", "/locations", { name, type: "bin" });
const item = (body: object) => ok<ItemDetail>("POST", "/items", body);
const putBack = (body: object) => ok<StockResult>("POST", "/putback", body);
const qtyAt = (i: ItemDetail, locationId: number) => i.places.find((p) => p.locationId === locationId)?.qty;
const putBackBin = async () => (await ok<LocationSummary[]>("GET", "/locations")).find((l) => l.type === "put_back")!;

describe("put-back", () => {
  it("adds one to the bin it goes back into", async () => {
    const b = await bin("Bin 7");
    const s = await item({ name: "M3 screw", locationId: b.id, qty: 10 });
    const r = await putBack({ itemId: s.id, locationId: b.id });
    expect(qtyAt(r.item, b.id)).toBe(11);
    expect(r.eventId).not.toBeNull();
  });

  it("moves it out of the put-back bin when it was recorded there", async () => {
    const b = await bin("Bin 7");
    const pb = await putBackBin();
    const s = await item({ name: "Spacer", locationId: b.id, qty: 10 });
    await ok("POST", "/stock/move", { itemId: s.id, fromLocationId: b.id, toLocationId: pb.id, qty: 4 });
    const r = await putBack({ itemId: s.id, locationId: b.id, qty: 3 });
    expect([qtyAt(r.item, b.id), qtyAt(r.item, pb.id)]).toEqual([9, 1]);
    expect(r.item.totalQty).toBe(10);
  });

  it("puts a stickered unit back where it belongs, and undoes", async () => {
    const [shelf, desk] = [await bin("Shelf"), await bin("Desk")];
    const psu = await item({ code: "PSU00000001", locationId: shelf.id });
    const unitId = psu.unitList[0]!.id;
    await ok("POST", `/units/${unitId}/move`, { toLocationId: desk.id });
    const r = await putBack({ itemId: psu.id, locationId: shelf.id, unitId });
    expect(r.item.unitList[0]!.locationId).toBe(shelf.id);
    const undone = await ok<ItemDetail>("POST", `/events/${r.eventId}/undo`);
    expect(undone.unitList[0]!.locationId).toBe(desk.id);
  });

  it("refuses a unit that's already there", async () => {
    const shelf = await bin("Shelf");
    const psu = await item({ code: "PSU00000001", locationId: shelf.id });
    const r = await call("POST", "/putback", { itemId: psu.id, locationId: shelf.id, unitId: psu.unitList[0]!.id });
    expect(r.status).toBe(400);
  });

  it("puts a never-placed item somewhere and makes that its home", async () => {
    const b = await bin("Bin");
    const s = await item({ name: "Loose thing" });
    const r = await putBack({ itemId: s.id, locationId: b.id });
    expect(r.item.places).toEqual([expect.objectContaining({ locationId: b.id, qty: 1, isHome: true })]);
  });

  it("level items: records the place without changing the level", async () => {
    const b = await bin("Nails");
    const n = await item({ name: "Nails", locationId: b.id, level: "low" });
    const r = await putBack({ itemId: n.id, locationId: b.id });
    expect(r.eventId).toBeNull();
    expect(r.item.places[0]?.level).toBe("low");
  });
});

describe("backups", () => {
  it("snapshots the database and photos, and the snapshot restores", async () => {
    const b = await bin("Bin 7");
    const s = await item({ name: "M3 screw", locationId: b.id, qty: 10 });
    mkdirSync(join(dir, "photos"), { recursive: true });
    writeFileSync(join(dir, "photos", `${s.id}-abc.jpg`), "jpeg");

    const r = await ok<BackupInfo>("POST", "/backup");
    expect(r.last).toMatchObject({ ok: true, items: 1, photos: 1 });
    expect((await ok<BackupInfo>("GET", "/backup")).last?.snapshot).toBe(r.last!.snapshot);

    // Restore test: copy the snapshot + photos into a fresh data dir and open it.
    const restored = mkdtempSync(join(tmpdir(), "snt-restore-"));
    cpSync(join(dir, "backup", "snapshots", r.last!.snapshot!, "app.db"), join(restored, "app.db"));
    cpSync(join(dir, "backup", "photos"), join(restored, "photos"), { recursive: true });
    const api2 = createApi(openDb(join(restored, "app.db")), { photoDir: join(restored, "photos") });
    const back = (await (await api2.request(`/items/${s.id}`)).json()) as ItemDetail;
    expect(back).toMatchObject({ name: "M3 screw", totalQty: 10 });
    expect(back.places[0]?.path.at(-1)?.name).toBe("Bin 7");
    expect(readdirSync(join(restored, "photos"))).toEqual([`${s.id}-abc.jpg`]);
  });

  it("keeps only the newest snapshots", async () => {
    const cfg = { backupDir: join(dir, "backup"), photoDir: join(dir, "photos"), keep: 2 };
    for (const day of [1, 2, 3]) await runBackup(db, cfg, new Date(2026, 10, day, 3));
    expect(readdirSync(join(dir, "backup", "snapshots"))).toEqual(["2026-11-02_030000", "2026-11-03_030000"]);
  });

  it("reports a failure instead of throwing", async () => {
    writeFileSync(join(dir, "not-a-dir"), "x");
    const s = await runBackup(db, { backupDir: join(dir, "not-a-dir"), photoDir: join(dir, "photos"), keep: 2 });
    expect(s.ok).toBe(false);
    expect(s.error).toBeTruthy();
  });

  it("schedules the next run at the configured hour", () => {
    expect(msUntilHour(3, new Date(2026, 10, 3, 2, 30))).toBe(30 * 60_000);
    expect(msUntilHour(3, new Date(2026, 10, 3, 3, 0))).toBe(24 * 3600_000);
  });
});
