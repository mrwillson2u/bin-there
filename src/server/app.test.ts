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
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
