import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { openDb } from "./db/client";
import { createApi, type AiConfig } from "./app";
import { msUntilHour, scheduleBackups, type BackupConfig } from "./backup";
import { scheduleHousekeeping } from "./housekeeping";
import { adoptAllFields } from "./items";
import { ollamaWarm } from "./ai/ollama";

const dataDir = process.env.DATA_DIR ?? "./data";
const port = Number(process.env.PORT ?? 3000);
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, "app.db"), process.env.MIGRATIONS_DIR ?? "drizzle");
// Parts' own fields named like their category's become them (DEC-069): the ones filled in before
// the category had the field. Saving a category or a part does the same from then on.
const adopted = adoptAllFields(db);
if (adopted > 0) console.log(`Matched ${adopted} ${adopted === 1 ? "part's" : "parts'"} own fields to their category's`);

const photoDir = join(dataDir, "photos");
// Nightly backups to a second drive (F8). Off unless BACKUP_DIR is set.
const backup: BackupConfig | undefined = process.env.BACKUP_DIR
  ? { backupDir: process.env.BACKUP_DIR, photoDir, keep: Number(process.env.BACKUP_KEEP ?? 14) }
  : undefined;
if (backup) scheduleBackups(db, backup, Number(process.env.BACKUP_HOUR ?? 3));
else console.log("backups disabled: set BACKUP_DIR to enable");
// Items deleted over a month ago are removed for good, an hour after the backup.
scheduleHousekeeping(db, photoDir, msUntilHour, (Number(process.env.BACKUP_HOUR ?? 3) + 1) % 24);

// AI data fill (DEC-048): off unless AI_URL points at an Ollama server. SEARCH_URL is a SearXNG.
// SEARCH_ENGINES picks its engines (DEC-066). MOUSER_API_KEY and DIGIKEY_CLIENT_ID + DIGIKEY_CLIENT_SECRET let those two shops be read (DEC-049).
const ai: AiConfig | undefined = process.env.AI_URL
  ? {
      url: process.env.AI_URL,
      model: process.env.AI_MODEL ?? "gemma3:4b",
      searchUrl: process.env.SEARCH_URL || null,
      searchEngines: process.env.SEARCH_ENGINES || null,
      mouserKey: process.env.MOUSER_API_KEY || null,
      digikey: process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET ? { clientId: process.env.DIGIKEY_CLIENT_ID, clientSecret: process.env.DIGIKEY_CLIENT_SECRET } : null,
    }
  : undefined;
console.log(
  ai
    ? `AI data fill on: ${ai.model} at ${ai.url}, search ${ai.searchUrl ?? "off"}${ai.searchEngines ? ` (${ai.searchEngines})` : ""}, Mouser API ${ai.mouserKey ? "on" : "off"}, Digi-Key API ${ai.digikey ? "on" : "off"}`
    : "AI data fill off: set AI_URL to enable",
);

// Load the model now rather than on the first look-up (DEC-061); every call asks Ollama to keep it loaded.
if (ai) void ollamaWarm(ai.url, ai.model).then((ok) => console.log(ok ? `AI model ${ai.model} loaded and ready` : `AI model ${ai.model} couldn't be loaded ahead; it loads on first use`));

const app = new Hono();
app.route("/api", createApi(db, { photoDir, backup, ai }));
app.use("/*", serveStatic({ root: "./dist/web" }));
// SPA fallback: client-side routes get index.html.
app.get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: app.fetch, port }, () => console.log(`bin-there listening on :${port}`));
