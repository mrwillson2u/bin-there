import { describe, expect, it, beforeEach } from "vitest";
import { openDb } from "./db/client";
import { createApi } from "./app";
import type { LocationDetail, LocationSummary, ScanResult } from "../shared/api";

let api: ReturnType<typeof createApi>;

beforeEach(() => {
  api = createApi(openDb(":memory:"));
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await api.request(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

const create = (body: object) => call<LocationDetail>("POST", "/locations", body).then((r) => r.json);

describe("locations", () => {
  it("seeds a put-back bin", async () => {
    const { json } = await call<LocationSummary[]>("GET", "/locations");
    expect(json.map((l) => l.type)).toEqual(["put_back"]);
  });

  it("nests locations and builds the breadcrumb path", async () => {
    const rack = await create({ name: "Rack A", type: "rack" });
    const box = await create({ name: "Box 3", type: "gridded_box", parentId: rack.id });
    const bin = await create({ name: "M3 screws", type: "bin", binSize: "2x1", parentId: box.id });
    expect(bin.path.map((c) => c.name)).toEqual(["Rack A", "Box 3", "M3 screws"]);
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
    expect(json.path.map((c) => c.name)).toEqual(["Rack B", "Box", "Bin"]);
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
