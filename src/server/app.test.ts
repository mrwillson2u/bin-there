import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import type { LocationDetail, LocationSummary, ScanResult } from "../shared/api";

let api: ReturnType<typeof createApi>;
let site: LocationDetail;

beforeEach(async () => {
  api = createApi(openDb(":memory:"), { photoDir: mkdtempSync(join(tmpdir(), "snt-photos-")) });
  site = (await call<LocationDetail>("POST", "/locations", { name: "Garage", type: "site" })).json;
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await api.request(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

/** Locations go inside the Garage site unless a parent is given. */
const create = (body: { type: string; parentId?: number; [k: string]: unknown }) =>
  call<LocationDetail>("POST", "/locations", { parentId: body.type === "site" ? undefined : site.id, ...body }).then((r) => r.json);

describe("locations", () => {
  it("keeps only sites at the top level", async () => {
    const { json } = await call<LocationSummary[]>("GET", "/locations");
    expect(json.map((l) => [l.name, l.type])).toEqual([["Garage", "site"]]);
    expect((await call("POST", "/locations", { name: "Loose", type: "tote" })).status).toBe(400);
    expect((await call("POST", "/locations", { name: "Cottage", type: "site", parentId: site.id })).status).toBe(400);
    const tote = await create({ name: "Tote", type: "tote" });
    expect((await call("PATCH", `/locations/${tote.id}`, { parentId: null })).status).toBe(400);
    const basement = await create({ name: "Basement", type: "site" });
    expect((await call("PATCH", `/locations/${tote.id}`, { parentId: basement.id })).status).toBe(200);
  });

  it("nests locations and builds the breadcrumb path", async () => {
    const rack = await create({ name: "Rack A", type: "rack" });
    const box = await create({ name: "Box 3", type: "gridded_box", parentId: rack.id });
    const bin = await create({ name: "M3 screws", type: "bin", binSize: "2x1", parentId: box.id });
    expect(bin.path.map((c) => c.name)).toEqual(["Garage", "Rack A", "Box 3", "M3 screws"]);
    expect(bin.binSize).toBe("2x1");
    const { json: rackDetail } = await call<LocationDetail>("GET", `/locations/${rack.id}`);
    expect(rackDetail.children).toHaveLength(1);
    expect(rackDetail.children[0]!.childCount).toBe(1);
  });

  it("moves a container with everything inside it", async () => {
    const a = await create({ name: "Rack A", type: "rack" });
    const b = await create({ name: "Rack B", type: "rack" });
    const box = await create({ name: "Box", type: "gridded_box", parentId: a.id });
    const bin = await create({ name: "Bin", type: "bin", parentId: box.id });
    await call("PATCH", `/locations/${box.id}`, { parentId: b.id });
    const { json } = await call<LocationDetail>("GET", `/locations/${bin.id}`);
    expect(json.path.map((c) => c.name)).toEqual(["Garage", "Rack B", "Box", "Bin"]);
  });

  it("refuses to move a location inside itself", async () => {
    const box = await create({ name: "Box", type: "gridded_box" });
    const bin = await create({ name: "Bin", type: "bin", parentId: box.id });
    const { status } = await call("PATCH", `/locations/${box.id}`, { parentId: bin.id });
    expect(status).toBe(400);
  });

  it("ignores bin size on non-bins", async () => {
    const tote = await create({ name: "Tote", type: "tote", binSize: "2x2" });
    expect(tote.binSize).toBeNull();
  });

  it("rejects invalid input", async () => {
    const { status, json } = await call<{ error: { code: string } }>("POST", "/locations", { name: "", type: "rack" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
  });
});

describe("stickers and scanning", () => {
  it("resolves an assigned sticker to its location", async () => {
    const tote = await create({ name: "Tote 4", type: "tote", code: "SNT-0001" });
    const { json } = await call<ScanResult>("GET", "/scan/SNT-0001");
    expect(json.kind).toBe("location");
    if (json.kind === "location") expect(json.location.id).toBe(tote.id);
  });

  it("reports an unknown sticker as unassigned", async () => {
    const { json } = await call<ScanResult>("GET", "/scan/NEW-9");
    expect(json).toEqual({ kind: "unassigned", code: "NEW-9" });
  });

  it("ignores the scanner's &END! suffix", async () => {
    const bin = await create({ name: "Yellow bin", type: "bin", code: "HnVbi6RSP4ar&END!" });
    expect(bin.code).toBe("HnVbi6RSP4ar");
    const { json } = await call<ScanResult>("GET", `/scan/${encodeURIComponent("HnVbi6RSP4ar&END!")}`);
    expect(json.kind).toBe("location");
  });

  it("assigns a sticker to an existing location", async () => {
    const box = await create({ name: "Box", type: "gridded_box" });
    await call("POST", `/locations/${box.id}/code`, { code: "SNT-0002" });
    const { json } = await call<ScanResult>("GET", "/scan/SNT-0002");
    expect(json.kind).toBe("location");
  });

  it("won't assign a sticker twice", async () => {
    await create({ name: "A", type: "tote", code: "SNT-0003" });
    const b = await create({ name: "B", type: "tote" });
    const r1 = await call("POST", `/locations/${b.id}/code`, { code: "SNT-0003" });
    expect(r1.status).toBe(409);
    const r2 = await call("POST", "/locations", { name: "C", type: "tote", code: "SNT-0003" });
    expect(r2.status).toBe(409);
  });

  it("lets a location keep its own sticker on re-assign", async () => {
    const a = await create({ name: "A", type: "tote", code: "SNT-0004" });
    const r = await call("POST", `/locations/${a.id}/code`, { code: "SNT-0004" });
    expect(r.status).toBe(200);
  });
});

describe("api hygiene", () => {
  it("answers unknown API paths with a JSON 404, not the web app", async () => {
    const r = await call<{ error: { code: string } }>("GET", "/nope");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("NOT_FOUND");
  });

  it("answers a malformed body with a 400", async () => {
    const res = await api.request("/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
  });
});

describe("deleting locations", () => {
  it("only deletes an empty location, then hides it from lists and scans", async () => {
    const tote = await create({ name: "Tote", type: "tote", code: "T1" });
    const bin = await create({ name: "Bin", type: "bin", parentId: tote.id });
    expect((await call("DELETE", `/locations/${tote.id}`)).status).toBe(400);
    expect((await call<{ parentId: number }>("DELETE", `/locations/${bin.id}`)).json.parentId).toBe(tote.id);
    expect((await call("DELETE", `/locations/${tote.id}`)).status).toBe(200);
    expect((await call("GET", `/locations/${tote.id}`)).status).toBe(404);
    expect((await call<LocationDetail>("GET", `/locations/${site.id}`)).json.children).toEqual([]);
    // Its sticker is free to go on something else.
    expect((await call<ScanResult>("GET", "/scan/T1")).json.kind).toBe("unassigned");
    expect((await call("POST", "/locations", { name: "Tote 2", type: "tote", parentId: site.id, code: "T1" })).status).toBe(201);
  });
});

describe("migrations", () => {
  it("deletes the old put-back bin and moves top-level locations into a Garage site", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "snt-mig-")), "app.db");
    // A database from before DEC-009: migrations up to 0002 plus the old seed row.
    const old = new Database(file);
    for (const f of ["0000_init.sql", "0001_undo_data.sql", "0002_item_search.sql"]) {
      for (const stmt of readFileSync(join("drizzle", f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) old.exec(stmt);
    }
    old.exec(`create table "__drizzle_migrations" (id integer primary key autoincrement, hash text not null, created_at numeric)`);
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { when: number }[] };
    for (const e of journal.entries.slice(0, 3)) old.prepare(`insert into "__drizzle_migrations" (hash, created_at) values ('x', ?)`).run(e.when);
    old.exec(`insert into locations (type, name) values ('put_back', 'Put-back bin'), ('bin', 'Test 1')`);
    old.close();

    const migrated = createApi(openDb(file), { photoDir: mkdtempSync(join(tmpdir(), "snt-photos-")) });
    const json = (await (await migrated.request("/locations")).json()) as LocationSummary[];
    expect(json.map((l) => [l.name, l.type])).toEqual([["Garage", "site"]]);
    const garage = (await (await migrated.request(`/locations/${json[0]!.id}`)).json()) as LocationDetail;
    expect(garage.children.map((c) => c.name)).toEqual(["Test 1"]);
    const raw = new Database(file, { readonly: true });
    expect(raw.prepare("select count(*) as n from locations where type = 'put_back'").get()).toEqual({ n: 0 });
  });
});

describe("migration 0008 (DEC-023)", () => {
  it("gives automatic bin names fixed-width IDs in creation order and leaves other names alone", () => {
    const raw = new Database(":memory:");
    raw.exec(`create table locations (id integer primary key, type text, name text)`);
    const add = raw.prepare("insert into locations (type, name) values (?, ?)");
    for (const [t, n] of [["bin", "Bin 1"], ["bin", "Bin 2"], ["bin", "Small screws"], ["bin", "Bin 1"], ["bin", "Bin 3 spare"], ["tote", "Bin 9"], ["bin", "Bin 2"], ["bin", "Bin"], ["bin", "Bin 0002"]]) add.run(t, n);
    raw.exec(readFileSync(join("drizzle", "0008_bin_numbers_unique.sql"), "utf8"));
    expect(raw.prepare("select name from locations order by id").all().map((r) => (r as { name: string }).name)).toEqual([
      "Bin 0001", "Bin 0002", "Small screws", "Bin 0003", "Bin 3 spare", "Bin 9", "Bin 0004", "Bin", "Bin 0005",
    ]);
  });
});

describe("gridded box layout", () => {
  const box = () => create({ name: "Screws", type: "gridded_box" });
  const bin = (parentId: number, name: string, binSize: string) => create({ name, type: "bin", parentId, binSize });
  const place = (id: number, slot: { x: number; y: number; rotated?: boolean } | null) =>
    call<LocationDetail | { error: { code: string; message: string } }>("PUT", `/locations/${id}/slot`, slot);

  it("gives a gridded box the Allit grid and its bins a slot once placed", async () => {
    const b = await box();
    expect(b.grid).toEqual({ cols: 6, rows: 4 });
    const tote = await create({ name: "Tote", type: "tote" });
    expect(tote.grid).toBeNull();
    const red = await bin(b.id, "Red", "1x1");
    expect(red.slot).toBeNull();
    const placed = (await place(red.id, { x: 2, y: 3 })).json as LocationDetail;
    expect(placed.slot).toEqual({ x: 2, y: 3, rotated: false });
    const parent = (await call<LocationDetail>("GET", `/locations/${b.id}`)).json;
    expect(parent.children.find((c) => c.id === red.id)?.slot).toEqual({ x: 2, y: 3, rotated: false });
    const off = (await place(red.id, null)).json as LocationDetail;
    expect(off.slot).toBeNull();
  });

  it("refuses overlaps, overhangs, and the wrong row for the front strip", async () => {
    const b = await box();
    const blue = await bin(b.id, "Blue", "2x2");
    const yellow = await bin(b.id, "Yellow", "2x1");
    const strip = await bin(b.id, "Strip", "front_strip");
    expect((await place(blue.id, { x: 0, y: 0 })).status).toBe(200);
    const overlap = await place(yellow.id, { x: 1, y: 1 });
    expect(overlap.status).toBe(409);
    expect((overlap.json as { error: { message: string } }).error.message).toMatch(/already there/);
    expect((await place(yellow.id, { x: 5, y: 0 })).status).toBe(409); // hangs off the right edge
    expect((await place(yellow.id, { x: 5, y: 0, rotated: true })).status).toBe(200); // tall fits
    expect((await place(yellow.id, { x: 5, y: 3, rotated: true })).status).toBe(409); // tall hangs off the bottom
    expect((await place(strip.id, { x: 0, y: 0 })).status).toBe(409);
    expect((await place(strip.id, { x: 0, y: 4 })).status).toBe(200);
    expect((await place(blue.id, { x: 0, y: 4 })).status).toBe(409); // only the strip goes along the front
    expect((await place(b.id, { x: 0, y: 0 })).status).toBe(400); // a box isn't a bin
  });

  it("clears a bin's slot when it leaves the box or changes size", async () => {
    const a = await box();
    const b = await box();
    const red = await bin(a.id, "Red", "1x1");
    await place(red.id, { x: 1, y: 1 });
    const moved = (await call<LocationDetail>("PATCH", `/locations/${red.id}`, { parentId: b.id })).json;
    expect(moved.slot).toBeNull();
    await place(red.id, { x: 0, y: 0 });
    const resized = (await call<LocationDetail>("PATCH", `/locations/${red.id}`, { binSize: "2x1" })).json;
    expect(resized.slot).toBeNull();
    const notInBox = await bin(a.id, "Loose", "1x1");
    await call("PATCH", `/locations/${notInBox.id}`, { parentId: site.id });
    expect((await place(notInBox.id, { x: 0, y: 0 })).status).toBe(400);
  });

  it("numbers unnamed bins across the whole system and can drop one straight into a slot (DEC-020, DEC-023)", async () => {
    const b = await box();
    const first = await create({ type: "bin", parentId: b.id, binSize: "1x1", slot: { x: 0, y: 0 } });
    expect(first.name).toBe("Bin 0001");
    expect(first.slot).toEqual({ x: 0, y: 0, rotated: false });
    const tall = await create({ type: "bin", parentId: b.id, binSize: "2x1", slot: { x: 1, y: 0, rotated: true } });
    expect(tall.name).toBe("Bin 0002");
    expect(tall.slot).toEqual({ x: 1, y: 0, rotated: true });
    // A slot that's taken: nothing is created.
    const clash = await call<{ error: { message: string } }>("POST", "/locations", { type: "bin", parentId: b.id, binSize: "1x1", slot: { x: 0, y: 0 } });
    expect(clash.status).toBe(409);
    expect((await call<LocationDetail>("GET", `/locations/${b.id}`)).json.children).toHaveLength(2);
    // Numbers aren't reused after a delete, and a named bin doesn't take a number.
    await call("DELETE", `/locations/${tall.id}`);
    await create({ type: "bin", parentId: b.id, binSize: "1x1", name: "Odd screws" });
    expect((await create({ type: "bin", parentId: b.id, binSize: "1x1" })).name).toBe("Bin 0003");
    // Another box carries on from the same count, so a bin can move between boxes and stay unique.
    const other = await box();
    const four = await create({ type: "bin", parentId: other.id, binSize: "1x1" });
    expect(four.name).toBe("Bin 0004");
    expect((await call<LocationDetail>("PATCH", `/locations/${four.id}`, { parentId: b.id })).json.name).toBe("Bin 0004");
    expect((await create({ type: "bin", parentId: other.id, binSize: "1x1" })).name).toBe("Bin 0005");
    // Everything else still needs a name.
    expect((await call("POST", "/locations", { type: "tote", parentId: site.id })).status).toBe(400);
  });

  it("moves a sticker from one bin to another only when asked, and never off an item (DEC-022)", async () => {
    const b = await box();
    const one = await create({ type: "bin", parentId: b.id, binSize: "1x1", code: "BIN0001" });
    const two = await create({ type: "bin", parentId: b.id, binSize: "1x1" });
    expect((await call("POST", `/locations/${two.id}/code`, { code: "BIN0001" })).status).toBe(409);
    const moved = await call<LocationDetail>("POST", `/locations/${two.id}/code`, { code: "BIN0001", move: true });
    expect(moved.status).toBe(200);
    expect(moved.json.code).toBe("BIN0001");
    expect((await call<LocationDetail>("GET", `/locations/${one.id}`)).json.code).toBeNull();
    // Moving onto the bin that already has it is a no-op, not an error.
    expect((await call("POST", `/locations/${two.id}/code`, { code: "BIN0001", move: true })).status).toBe(200);
    // Clearing a sticker (what Undo does).
    expect((await call<LocationDetail>("PATCH", `/locations/${two.id}`, { code: null })).json.code).toBeNull();
    // An item's sticker stays put.
    await call("POST", "/items", { name: "PSU", locationId: one.id, code: "PSU0001" });
    expect((await call("POST", `/locations/${two.id}/code`, { code: "PSU0001", move: true })).status).toBe(409);
  });

  it("tells each bin's contents so the grid can show them", async () => {
    const b = await box();
    const red = await create({ type: "bin", parentId: b.id, binSize: "1x1" });
    const empty = await create({ type: "bin", parentId: b.id, binSize: "1x1" });
    await call("POST", "/items", { name: "M3 nuts", locationId: red.id, qty: 40 });
    await call("POST", "/items", { name: "M3 washers", locationId: red.id, qty: 10 });
    await call("POST", "/items", { name: "M3 x 10", locationId: red.id, code: "U0001" });
    const kids = (await call<LocationDetail>("GET", `/locations/${b.id}`)).json.children;
    expect(kids.find((c) => c.id === red.id)).toMatchObject({ itemCount: 3, preview: ["M3 nuts", "M3 washers"] });
    expect(kids.find((c) => c.id === empty.id)).toMatchObject({ itemCount: 0, preview: [] });
  });
});
