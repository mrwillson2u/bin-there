import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { locations, units } from "./db/schema";
import { errorResponse, parseBody } from "./errors";
import {
  assignLocationCode,
  createLocation,
  getLocation,
  listLocations,
  updateLocation,
} from "./locations";
import {
  assignCodeSchema,
  codeSchema,
  createLocationSchema,
  updateLocationSchema,
  type ScanResult,
} from "../shared/api";

export function createApi(db: Db) {
  const api = new Hono();
  api.onError((err, c) => errorResponse(c, err));

  api.get("/health", (c) => c.json({ ok: true }));

  api.get("/scan/:code", (c) => {
    const code = parseBody(codeSchema, c.req.param("code"));
    const loc = db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).get();
    if (loc) return c.json<ScanResult>({ kind: "location", location: getLocation(db, loc.id) });
    const unit = db.select({ id: units.id, itemId: units.itemId }).from(units).where(eq(units.code, code)).get();
    if (unit) return c.json<ScanResult>({ kind: "unit", unitId: unit.id, itemId: unit.itemId });
    return c.json<ScanResult>({ kind: "unassigned", code });
  });

  api.get("/locations", (c) => {
    const parent = c.req.query("parent");
    return c.json(listLocations(db, parent ? Number(parent) : null));
  });
  api.get("/locations/:id", (c) => c.json(getLocation(db, Number(c.req.param("id")))));
  api.post("/locations", async (c) => {
    const input = parseBody(createLocationSchema, await c.req.json());
    return c.json(createLocation(db, input), 201);
  });
  api.patch("/locations/:id", async (c) => {
    const input = parseBody(updateLocationSchema, await c.req.json());
    return c.json(updateLocation(db, Number(c.req.param("id")), input));
  });
  api.post("/locations/:id/code", async (c) => {
    const { code } = parseBody(assignCodeSchema, await c.req.json());
    return c.json(assignLocationCode(db, Number(c.req.param("id")), code));
  });

  return api;
}
