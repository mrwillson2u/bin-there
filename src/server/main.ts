import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { openDb } from "./db/client";
import { createApi } from "./app";
import { scheduleBackups, type BackupConfig } from "./backup";

const dataDir = process.env.DATA_DIR ?? "./data";
const port = Number(process.env.PORT ?? 3000);
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, "app.db"), process.env.MIGRATIONS_DIR ?? "drizzle");

const photoDir = join(dataDir, "photos");
// Nightly backups to a second drive (F8). Off unless BACKUP_DIR is set.
const backup: BackupConfig | undefined = process.env.BACKUP_DIR
  ? { backupDir: process.env.BACKUP_DIR, photoDir, keep: Number(process.env.BACKUP_KEEP ?? 14) }
  : undefined;
if (backup) scheduleBackups(db, backup, Number(process.env.BACKUP_HOUR ?? 3));
else console.log("backups disabled: set BACKUP_DIR to enable");

const app = new Hono();
app.route("/api", createApi(db, { photoDir, backup }));
app.use("/*", serveStatic({ root: "./dist/web" }));
// SPA fallback: client-side routes get index.html.
app.get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: app.fetch, port }, () => console.log(`stack-n-track listening on :${port}`));
