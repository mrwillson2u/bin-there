import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { openDb } from "./db/client";
import { createApi } from "./app";

const dataDir = process.env.DATA_DIR ?? "./data";
const port = Number(process.env.PORT ?? 3000);
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, "app.db"), process.env.MIGRATIONS_DIR ?? "drizzle");

const app = new Hono();
app.route("/api", createApi(db));
app.use("/*", serveStatic({ root: "./dist/web" }));
// SPA fallback: client-side routes get index.html.
app.get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: app.fetch, port }, () => console.log(`stack-n-track listening on :${port}`));
