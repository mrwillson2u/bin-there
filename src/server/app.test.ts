import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { STARTER_CATEGORIES } from "./items";
import { createApi } from "./app";
import type { LocationDetail, LocationSummary, PinnedLocation, ScanResult } from "../shared/api";

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

  it("lists every place, whatever it's inside, in tree order with paths", async () => {
    const rack = await create({ name: "Rack A", type: "rack" });
    const box = await create({ name: "Box", type: "gridded_box", parentId: rack.id });
    await create({ type: "bin", parentId: box.id });
    await create({ type: "bin", parentId: box.id });
    await create({ name: "Bench", type: "shelf" });
    const gone = await create({ name: "Old tote", type: "tote" });
    await call("DELETE", `/locations/${gone.id}`);
    const all = (await call<PinnedLocation[]>("GET", "/locations?all=1")).json;
    // One site: the site itself is left out; deleted places too.
    expect(all.map((l) => l.path.map((c) => c.name).join(" > "))).toEqual([
      "Garage > Bench",
      "Garage > Rack A",
      "Garage > Rack A > Box",
      "Garage > Rack A > Box > Bin 0001",
      "Garage > Rack A > Box > Bin 0002",
    ]);
    expect(all.find((l) => l.name === "Box")!.childCount).toBe(2);
    await create({ name: "Basement", type: "site" });
    const two = (await call<PinnedLocation[]>("GET", "/locations?all=1")).json;
    expect(two.filter((l) => l.type === "site").map((l) => l.name)).toEqual(["Basement", "Garage"]);
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

describe("racks with positions (DEC-034)", () => {
  type Err = { error: { message: string } };
  const order = async (rackId: number) =>
    (await call<LocationDetail>("GET", `/locations/${rackId}`)).json.children.map((x) => [x.position, x.name]);

  it("sets up positions 1, 2, 3… from what's inside, moves along on a drop, and takes labels", async () => {
    const rack = await create({ name: "Grid-Box Rack", type: "rack" });
    for (const n of ["Box 10", "Box 2", "Box 3"]) await create({ name: n, type: "gridded_box", parentId: rack.id });
    expect(await order(rack.id)).toEqual([[null, "Box 2"], [null, "Box 3"], [null, "Box 10"]]); // names number-aware

    const setUp = (await call<LocationDetail>("PUT", `/locations/${rack.id}/rack-size`, { size: 5 })).json;
    expect(setUp.rack).toEqual({ size: 5, labels: [null, null, null, null, null] });
    expect(await order(rack.id)).toEqual([["1", "Box 2"], ["2", "Box 3"], ["3", "Box 10"]]);

    // Drop Box 10 on position 1: the ones in between move down one (DEC-035).
    const box10 = setUp.children.find((c) => c.name === "Box 10")!;
    await call("PUT", `/locations/${box10.id}/rack-slot`, { slot: 0 });
    expect(await order(rack.id)).toEqual([["1", "Box 10"], ["2", "Box 2"], ["3", "Box 3"]]);

    // Labels: blank keeps the number; two the same is refused.
    const labelled = (await call<LocationDetail>("PUT", `/locations/${rack.id}/rack-labels`, { labels: [null, null, "Top", "", null] })).json;
    expect(labelled.rack!.labels).toEqual([null, null, "Top", null, null]);
    expect(await order(rack.id)).toEqual([["1", "Box 10"], ["2", "Box 2"], ["Top", "Box 3"]]);
    const dup = await call<Err>("PUT", `/locations/${rack.id}/rack-labels`, { labels: ["2"] });
    expect([dup.status, dup.json.error.message]).toEqual([409, "Positions 1 and 2 would both be 2"]);

    // Can't shrink past a position in use; can grow.
    const shrink = await call<Err>("PUT", `/locations/${rack.id}/rack-size`, { size: 2 });
    expect([shrink.status, shrink.json.error.message]).toEqual([409, "Box 3 is in position Top. Move it first"]);
    expect((await call("PUT", `/locations/${rack.id}/rack-size`, { size: 8 })).status).toBe(200);

    // A new box straight into a free position; a taken one is refused.
    const fresh = await create({ name: "Box 4", type: "gridded_box", parentId: rack.id, rackSlot: 3 });
    expect(fresh.position).toBe("4");
    expect((await call("POST", "/locations", { name: "Box 5", type: "gridded_box", parentId: rack.id, rackSlot: 3 })).status).toBe(409);

    // Paths and the activity log show the label; moving away clears it.
    const bin = await create({ type: "bin", parentId: fresh.id });
    const binPath = (await call<LocationDetail>("GET", `/locations/${bin.id}`)).json.path;
    expect(binPath.map((x) => x.position ?? null)).toEqual([null, null, "4", null]);
    // Each step says what it is, and a rack how big it is, so a screen can draw the walk (DEC-038).
    expect(binPath.map((x) => [x.type, x.rackSize, x.rackSlot])).toEqual([["site", null, null], ["rack", 8, null], ["gridded_box", null, 3], ["bin", null, null]]);
    const ev = (await call<{ location: string | null }[]>("GET", `/events?location=${bin.id}`)).json;
    expect(ev[0]!.location).toBe("Garage › Grid-Box Rack › level 4 · Box 4 › Bin 0001");
    const moved = (await call<LocationDetail>("PATCH", `/locations/${fresh.id}`, { parentId: site.id })).json;
    expect([moved.rackSlot, moved.position]).toEqual([null, null]);
    // …and can come back straight into a position.
    const back = (await call<LocationDetail>("PATCH", `/locations/${fresh.id}`, { parentId: rack.id, rackSlot: 7 })).json;
    expect(back.position).toBe("8");

    // One coming in from "not in a position" onto a taken position: the rest make room below.
    const extra = await create({ name: "Box 6", type: "gridded_box", parentId: rack.id });
    await call("PUT", `/locations/${extra.id}/rack-slot`, { slot: 1 });
    expect((await order(rack.id)).slice(0, 4)).toEqual([["1", "Box 10"], ["2", "Box 6"], ["Top", "Box 2"], ["4", "Box 3"]]);
    // A full rack has no room for one more.
    const small = await create({ name: "Small rack", type: "rack", rackSize: 2 });
    await create({ name: "S1", type: "gridded_box", parentId: small.id, rackSlot: 0 });
    await create({ name: "S2", type: "gridded_box", parentId: small.id, rackSlot: 1 });
    const crowd = await create({ name: "S3", type: "gridded_box", parentId: small.id });
    const full = await call<Err>("PUT", `/locations/${crowd.id}/rack-slot`, { slot: 0 });
    expect([full.status, full.json.error.message]).toEqual([409, "Every position in Small rack is in use. Add one first"]);

    // Taking positions away leaves everything inside, not in a position.
    await call("PUT", `/locations/${rack.id}/rack-size`, { size: null });
    expect((await order(rack.id)).every(([p]) => p === null)).toBe(true);
    expect((await call("PUT", `/locations/${fresh.id}/rack-slot`, { slot: 0 })).status).toBe(400);
    const tote = await create({ name: "Tote", type: "tote" });
    expect((await call("PUT", `/locations/${tote.id}/rack-size`, { size: 3 })).status).toBe(400);
  });
});

describe("migration 0014 (DEC-034)", () => {
  it("carries typed whole-number positions into rack positions and drops the old column", () => {
    const file = join(mkdtempSync(join(tmpdir(), "snt-rack-")), "app.db");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    const upTo = journal.entries.findIndex((e) => e.tag === "0014_rack_positions");
    const raw = new Database(file);
    raw.exec(`create table "__drizzle_migrations" (id integer primary key autoincrement, hash text not null, created_at numeric)`);
    for (const e of journal.entries.slice(0, upTo)) {
      for (const stmt of readFileSync(join("drizzle", `${e.tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) raw.exec(stmt);
      raw.prepare(`insert into "__drizzle_migrations" (hash, created_at) values ('x', ?)`).run(e.when);
    }
    raw.exec(`insert into categories (name) values ('Tools')`);
    raw.exec(`insert into locations (id, type, name) values (1, 'site', 'Garage')`);
    raw.exec(`insert into locations (id, type, name, parent_id) values (2, 'rack', 'Grid-Box Rack', 1)`);
    const add = raw.prepare(`insert into locations (type, name, parent_id, position) values ('gridded_box', ?, 2, ?)`);
    for (const [n, p] of [["Grid box 1", "1"], ["Grid box 2", "2"], ["Grid box 3", "3"], ["Odd one", "Top"]]) add.run(n, p);
    raw.close();

    openDb(file);
    const after = new Database(file, { readonly: true });
    const rows = after.prepare("select name, rack_slot, rack_size from locations order by id").all() as { name: string; rack_slot: number | null; rack_size: number | null }[];
    expect(rows.map((r) => [r.name, r.rack_slot, r.rack_size])).toEqual([
      ["Garage", null, null], ["Grid-Box Rack", null, 3], ["Grid box 1", 0, null], ["Grid box 2", 1, null], ["Grid box 3", 2, null], ["Odd one", null, null],
    ]);
    expect((after.prepare("pragma table_info(locations)").all() as { name: string }[]).some((c) => c.name === "position")).toBe(false);
  }, 20_000);
});

describe("migration 0017 (DEC-037)", () => {
  it("puts parts without a category back on Needs details", () => {
    const file = join(mkdtempSync(join(tmpdir(), "snt-needs-")), "app.db");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    const upTo = journal.entries.findIndex((e) => e.tag === "0017_needs_details_category");
    const raw = new Database(file);
    raw.exec(`create table "__drizzle_migrations" (id integer primary key autoincrement, hash text not null, created_at numeric)`);
    for (const e of journal.entries.slice(0, upTo)) {
      for (const stmt of readFileSync(join("drizzle", `${e.tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) raw.exec(stmt);
      raw.prepare(`insert into "__drizzle_migrations" (hash, created_at) values ('x', ?)`).run(e.when);
    }
    raw.exec(`insert into categories (id, name) values (1, 'Tools')`);
    const add = raw.prepare(`insert into items (name, category_id, needs_details, archived) values (?, ?, ?, ?)`);
    for (const row of [["Done", 1, 0, 0], ["Name only", null, 0, 0], ["Photo only", null, 1, 0], ["Deleted", null, 0, 1]]) add.run(...row);
    raw.close();

    openDb(file);
    const after = new Database(file, { readonly: true });
    const rows = after.prepare("select name, needs_details from items order by id").all() as { name: string; needs_details: number }[];
    expect(rows.map((r) => [r.name, r.needs_details])).toEqual([["Done", 0], ["Name only", 1], ["Photo only", 1], ["Deleted", 0]]);
  }, 20_000);
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

describe("migration 0009 (DEC-027)", () => {
  const names = (file: string) => {
    const raw = new Database(file, { readonly: true });
    const out = raw.prepare("select name from categories order by name").all().map((r) => (r as { name: string }).name);
    raw.close();
    return out;
  };

  it("gives a new database every starter category once", () => {
    const file = join(mkdtempSync(join(tmpdir(), "snt-cat-")), "app.db");
    openDb(file);
    expect(names(file)).toEqual(STARTER_CATEGORIES.map((c) => c.name).sort());
  });

  it("adds the new ones to an older database, without a second copy of one you already made", () => {
    // A database last migrated by 0008, with the original seven categories and one made by hand.
    const file = join(mkdtempSync(join(tmpdir(), "snt-cat-")), "app.db");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    const upTo = journal.entries.findIndex((e) => e.tag === "0009_more_categories");
    const raw = new Database(file);
    raw.exec(`create table "__drizzle_migrations" (id integer primary key autoincrement, hash text not null, created_at numeric)`);
    for (const e of journal.entries.slice(0, upTo)) {
      for (const stmt of readFileSync(join("drizzle", `${e.tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) raw.exec(stmt);
      raw.prepare(`insert into "__drizzle_migrations" (hash, created_at) values ('x', ?)`).run(e.when);
    }
    const original = STARTER_CATEGORIES.slice(0, 7).map((c) => c.name);
    for (const n of [...original, "batteries"]) raw.prepare("insert into categories (name) values (?)").run(n);
    raw.close();

    openDb(file);
    const after = names(file);
    expect(after.filter((n) => n.toLowerCase() === "batteries")).toEqual(["batteries"]);
    expect(after.filter((n) => n !== "batteries").sort()).toEqual(STARTER_CATEGORIES.map((c) => c.name).filter((n) => n !== "Batteries").sort());
  }, 20_000); // replays every migration up to 0008 on a real file, slow on a busy machine
});

describe("taking a bin out (DEC-028)", () => {
  type Err = { error: { code: string; message: string } };
  const setup = async () => {
    const box = await create({ name: "Screws", type: "gridded_box" });
    const bin = await create({ type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 2, y: 1 } });
    const kit = await create({ name: "Weather station", type: "project" });
    const item = (await call<{ id: number }>("POST", "/items", { name: "M3 nuts", locationId: bin.id, qty: 10 })).json;
    return { box, bin, kit, item };
  };

  it("keeps its spot, says where it went, and goes back to the same spot", async () => {
    const { box, bin, kit, item } = await setup();
    const out = (await call<LocationDetail>("POST", `/locations/${bin.id}/take-out`, { toLocationId: kit.id })).json;
    expect(out.out).toMatchObject({ to: { id: kit.id, name: "Weather station" }, note: null });
    expect(out.slot).toEqual({ x: 2, y: 1, rotated: false });
    const boxNow = (await call<LocationDetail>("GET", `/locations/${box.id}`)).json;
    expect(boxNow.children[0]!.out?.to?.name).toBe("Weather station");
    // The saved spot stays taken, and says why.
    const other = await create({ type: "bin", parentId: box.id, binSize: "1x1" });
    const taken = await call<Err>("PUT", `/locations/${other.id}/slot`, { x: 2, y: 1 });
    expect([taken.status, taken.json.error.message]).toEqual([409, "That spot is saved for Bin 0001, which is out. Free its spot first"]);
    // The kit lists it, and the part says where its bin is.
    const kitNow = (await call<LocationDetail>("GET", `/locations/${kit.id}`)).json;
    expect(kitNow.outHere.map((b) => [b.name, b.path.at(-2)?.name])).toEqual([[bin.name, "Screws"]]);
    expect((await call<{ bins: number }[]>("GET", "/projects")).json[0]!.bins).toBe(1);
    const part = (await call<{ places: { out: { to: { name: string } | null } | null }[] }>("GET", `/items/${item.id}`)).json;
    expect(part.places[0]!.out?.to?.name).toBe("Weather station");
    // The kit can't be deleted while the bin is out to it.
    expect((await call<Err>("DELETE", `/locations/${kit.id}`)).json.error.message).toMatch(/Put Bin 0001 back/);

    const back = (await call<LocationDetail>("POST", `/locations/${bin.id}/put-back`)).json;
    expect([back.out, back.slot]).toEqual([null, { x: 2, y: 1, rotated: false }]);
    expect((await call("POST", `/locations/${bin.id}/put-back`)).status).toBe(409);
    const log = (await call<{ type: string; to: string | null }[]>("GET", `/events?location=${bin.id}`)).json;
    expect(log.slice(0, 2).map((e) => e.type)).toEqual(["check_in", "check_out"]);
  });

  it("can give up its spot while out, for a new bin; back, it waits unplaced", async () => {
    const { box, bin } = await setup();
    await call("POST", `/locations/${bin.id}/take-out`, { note: "keeping it at the bench" });
    const freed = (await call<LocationDetail>("PUT", `/locations/${bin.id}/slot`, null)).json;
    expect([freed.slot, freed.out?.note]).toEqual([null, "keeping it at the bench"]);
    const fresh = await create({ type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 2, y: 1 } });
    expect(fresh.slot).toEqual({ x: 2, y: 1, rotated: false });
    const back = (await call<LocationDetail>("POST", `/locations/${bin.id}/put-back`)).json;
    expect([back.out, back.slot, back.parentId]).toEqual([null, null, box.id]);
  });

  it("takes a note instead of a kit, and refuses what doesn't make sense", async () => {
    const { box, bin, kit } = await setup();
    const tote = await create({ name: "Tote", type: "tote" });
    expect((await call("POST", `/locations/${bin.id}/take-out`, {})).status).toBe(400);
    expect((await call("POST", `/locations/${bin.id}/take-out`, { toLocationId: box.id })).status).toBe(400);
    expect((await call("POST", `/locations/${tote.id}/take-out`, { note: "car" })).status).toBe(400);
    const noted = (await call<LocationDetail>("POST", `/locations/${bin.id}/take-out`, { note: "on the bench" })).json;
    expect(noted.out).toMatchObject({ to: null, note: "on the bench" });
    expect((await call("POST", `/locations/${bin.id}/take-out`, { toLocationId: kit.id })).status).toBe(409);
  });

  it("goes back when the kit is finished, and stops being out if moved to another box", async () => {
    const { bin, kit } = await setup();
    await call("POST", `/locations/${bin.id}/take-out`, { toLocationId: kit.id });
    const r = (await call<{ returned: number; finished: boolean }>("POST", `/projects/${kit.id}/return`, { finish: true })).json;
    expect(r).toMatchObject({ returned: 1, finished: true });
    expect((await call<LocationDetail>("GET", `/locations/${bin.id}`)).json.out).toBeNull();

    const box2 = await create({ name: "Box 2", type: "gridded_box" });
    await call("POST", `/locations/${bin.id}/take-out`, { note: "bench" });
    const moved = (await call<LocationDetail>("PATCH", `/locations/${bin.id}`, { parentId: box2.id })).json;
    expect([moved.out, moved.slot]).toEqual([null, null]);
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

describe("live updates (DEC-046)", () => {
  /** Opens the change stream and returns a reader of its events, one JSON object per "change". */
  async function listen() {
    const res = await api.request("/changes");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const next = async (): Promise<{ version: number; by: string | null }> => {
      for (;;) {
        const at = buffered.indexOf("\n\n");
        if (at >= 0) {
          const block = buffered.slice(0, at);
          buffered = buffered.slice(at + 2);
          if (block.startsWith(":")) continue; // keep-alive comment
          const data = block.split("\n").find((l) => l.startsWith("data: "))!.slice(6);
          return JSON.parse(data);
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buffered += decoder.decode(value);
      }
    };
    return { next, close: () => reader.cancel() };
  }

  it("says where the server is now, then one change per write, naming the writer", async () => {
    const stream = await listen();
    expect(await stream.next()).toEqual({ version: 1, by: null }); // the Garage site from setup
    const tote = await create({ name: "Tote", type: "tote" });
    expect(await stream.next()).toEqual({ version: 2, by: null });
    await api.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "phone-1" },
      body: JSON.stringify({ name: "Zip ties", locationId: tote.id, qty: 5 }),
    });
    expect(await stream.next()).toEqual({ version: 3, by: "phone-1" });
    await stream.close();
  });

  it("stays quiet for reads, failed writes and backups", async () => {
    const stream = await listen();
    expect(await stream.next()).toEqual({ version: 1, by: null });
    await call("GET", "/locations");
    expect((await call("POST", "/locations", { name: "", type: "nope" })).status).toBe(400);
    expect((await call("POST", "/backup")).status).toBe(400); // backups aren't set up in tests, and never count anyway
    const tote = await create({ name: "Tote", type: "tote" });
    expect(tote.id).toBeGreaterThan(0);
    expect(await stream.next()).toEqual({ version: 2, by: null }); // the first thing heard is the real write
    await stream.close();
  });
});
