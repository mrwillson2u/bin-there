# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules of behavior live in AGENTS.md

Read and follow `AGENTS.md` first. It is the canonical instruction file and holds the project-specific
rules (fresh start, one question at a time, plain language, log decisions as DEC entries, protect the
live data, verify before claiming done). This file does not restate them; it only adds the commands
and code architecture. Current state, where things run, and what's next are in the **Handoff**
section of `framework/AI-Context.md`. Deploy and restore steps are in `DEPLOY.md`.

## This checkout may be the live server

`~/bin-there` on `ubuntubot` is the production checkout: the `bin-there` Docker container runs from
it and `./data` is the live database and photos. Check `hostname` before running anything. On
ubuntubot, do not run `npm run dev`, `npm start`, or tests that write to `./data`; `node_modules`
is deliberately absent there (the image installs its own). Develop on another machine or in a copy
with its own `DATA_DIR`, and take a backup before any redeploy (see `AGENTS.md`).

## Commands

```bash
npm install
npm run dev            # API on :3000 (tsx watch) + Vite on :5173 (proxies /api)
npm test               # Vitest, all tests (server API tests + scanner detector tests)
npx vitest run src/server/items.test.ts      # one file
npx vitest run -t "keeps only sites"         # one test by name
npm run typecheck      # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build          # vite build → dist/web, esbuild server → dist/server.js
npm start              # node dist/server.js (needs a build first)
npm run db:generate    # drizzle-kit: new SQL migration after editing src/server/db/schema.ts
```

There is no linter configured. The Docker image build (`docker compose up -d --build`) runs
`npm test` and refuses to ship if tests fail.

Run a throwaway copy, never against the real data:

```bash
PORT=3001 DATA_DIR=/tmp/bt-test npm start
```

Server env vars: `PORT`, `DATA_DIR` (holds `app.db` and `photos/`), `MIGRATIONS_DIR`
(default `drizzle`), `BACKUP_DIR` (backups off unless set), `BACKUP_HOUR`, `BACKUP_KEEP`.

After a schema change, run `npm run db:generate` and check the migration against an old-shaped
database; the "migrations" test in `src/server/app.test.ts` shows how.

## Architecture

One Node process (`src/server/main.ts`) serves both the JSON API under `/api` and the built React
app from `dist/web`, with an SPA fallback to `index.html`. Vite's root is `src/web`, so web files
are `src/web/index.html`, `src/web/main.tsx`, etc.

### Server (`src/server/`)

- `app.ts` exports `createApi(db, { photoDir, backup })`, a Hono router with no process-level
  state. Tests build it with `openDb(":memory:")` and call `api.request(...)` directly, so there is
  no HTTP server in tests.
- `db/client.ts` opens better-sqlite3 (WAL, foreign keys on), wraps it in Drizzle, runs the SQL
  migrations from `drizzle/` on open, and seeds starter categories into an empty database.
- `db/schema.ts` is the single source of truth for tables; `framework/06-Data-Model.md` explains why.
- Domain modules take `db` as the first argument and throw `ApiError(status, code, message)` from
  `errors.ts`; `api.onError` turns that into `{ error: { code, message } }`. `parseBody(schema, body)`
  validates with zod and throws a 400 on failure.
  - `locations.ts`: hierarchy. Sites are the top level; everything else must have a parent.
  - `items.ts`: items, categories, search. Search uses an FTS5 table kept in sync by `indexItem`;
    any change to an item's searchable fields must call it.
  - `stock.ts`: adjust, recount, move, and stickered units (create, move, check out, check in).
  - `putback.ts`, `pins.ts`, `backup.ts` (SQLite online backup + photo sync, nightly and on start),
    `housekeeping.ts` (hard-deletes items archived over 30 days ago, nightly and on start).
  - `events.ts`: activity log and undo.

**Undo invariant.** Every stock mutation writes one row to `events` in the same transaction, with
`undoData` holding the rows as they were before. Undo restores that snapshot and marks the event
`undoneBy`. Only an item's most recent un-undone event can be undone, so undo never clobbers a
later change. Stock endpoints return `StockResult = { eventId, item }` so the client can offer Undo.
A new kind of stock change must follow this pattern.

**Codes.** A sticker code is unique across `locations.code` and `units.code`. `GET /api/scan/:code`
resolves it to `location`, `unit`, or `unassigned`. `codeSchema` in `src/shared/api.ts` normalizes
codes (trims and strips the legacy `&END!` scanner suffix) so the camera and the hardware scanner
agree.

**Items and stock.** An item is `consumable` or `returnable`, tracked as `exact` (a count) or
`level` (plenty/low/out). The `stock` table is keyed by (item, location). Returnables can also exist
as `units`: individually stickered things with their own location, home, and checkout state.
`item_homes` lists where an item belongs, which drives put-back.

### Shared (`src/shared/api.ts`)

All zod request schemas and all response types live here and are imported by both server and web.
Change an API shape here first; the server handlers and React pages both typecheck against it.
`src/shared/grid.ts` holds the gridded-box layout rules (bin footprints, fit/overlap checks, snap);
the server uses them to validate `PUT /locations/:id/slot` and `BoxGrid.tsx` uses them while dragging.

### Web (`src/web/`)

- React 19, React Router, TanStack Query, Tailwind v4. `api.ts` is a thin `fetch` wrapper that
  throws `RequestError`; pages use `useQuery`/`useMutation` and invalidate queries after writes.
- `App.tsx` holds the routes and the shell (bottom bar on phones, sidebar at `lg`).
- **Scanning** (`scan/`): `ScanProvider` installs one capture-phase `keydown` listener for the
  whole app. `detector.ts` (pure, unit-tested) tells scanner input from typing: a `Ctrl+B` prefix
  from the hardware scanner puts it in scan mode and swallows keys until Enter; a timing-burst
  fallback catches prefix-less scans and reports how many characters leaked into the focused
  field so they can be removed. The camera scanner (`@zxing/browser`) is lazy-loaded and feeds the
  same `submit(code)`. Pages that want to consume a scan call `useScanHandler` and return `true`;
  the most recently mounted handler wins, and unhandled scans fall back to opening whatever was
  scanned via `/api/scan/:code`.
- Photos are resized on the device (`lib/photo.ts`) into a photo and a thumbnail before upload;
  the server only stores JPEGs under `DATA_DIR/photos`.
- `public/sw.js` caches only the app shell and hashed assets, never `/api`, so stock data is
  always fresh.

### Docs

`framework/` holds the plan: PRD, data model, API contract, decision log (DEC-xxx), and the
AI-Context handoff. Keep them true when code changes (see "Keeping Docs True" in `AGENTS.md`).
`framework/kit/` holds material from the ai-framework kit that is not specific to this app: the
discovery question set, the UI-prompt template, the kit changelog, and the demo project.
