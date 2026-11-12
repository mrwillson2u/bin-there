# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules of behavior live in AGENTS.md

Read and follow `AGENTS.md` first. It is the canonical instruction file and holds the project-specific
rules (fresh start, one question at a time, plain language, log decisions as DEC entries, protect the
live data, verify before claiming done). This file does not restate them; it only adds the commands
and code architecture. Current state, where things run, and what's next are in the **Handoff**
section of `framework/AI-Context.md`. Deploy and restore steps are in `DEPLOY.md`.

## Two folders on the server: production and development

On `ubuntubot` (check `hostname` and `pwd` before running anything), `~/bin-there-prod` is production:
only ever `main`, the `bin-there` Docker container runs from it and its `./data` is the live database
and photos; it is only ever touched to deploy (DEC-050). `~/bin-there` is development: one checkout
where branches are switched freely (usually `dev`), with the dev instance (`compose.dev.yaml`: container
`bin-there-dev` on :3001, throwaway data; DEC-040). The AI's Ollama container (`bin-there-ollama`) belongs to
the production compose file and serves both instances (DEC-054). Never make a third
folder for a branch. On ubuntubot, do not run `npm run dev`, `npm start`, or tests that write to
`./data`; `node_modules` is deliberately absent there (the image installs its own); run checks on a
copy with its own `DATA_DIR`. Take a backup before any redeploy of the live app (see `AGENTS.md`).

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

Headless-browser checks and the user-story walk live in `scripts/ui-checks/` (see its README; Playwright is installed with `--no-save` in a dev copy, never on ubuntubot). There is no linter configured. The Docker image build (`docker compose up -d --build`) runs
`npm test` and refuses to ship if tests fail.

Run a throwaway copy, never against the real data:

```bash
PORT=3011 DATA_DIR=/tmp/bt-test npm start
```

Server env vars: `PORT`, `DATA_DIR` (holds `app.db` and `photos/`), `MIGRATIONS_DIR`
(default `drizzle`), `BACKUP_DIR` (backups off unless set), `BACKUP_HOUR`, `BACKUP_KEEP`, and on the
for the AI data fill (on both instances since DEC-054) `AI_URL` (Ollama; AI data fill off unless set), `AI_MODEL` (the code's default `gemma3:4b`; both compose files set `gemma4:e4b`, DEC-053), `SEARCH_URL` (SearXNG),
`MOUSER_API_KEY`, `DIGIKEY_CLIENT_ID` + `DIGIKEY_CLIENT_SECRET` (shop APIs, DEC-049).

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
  - `locations.ts`: hierarchy. Sites are the top level; everything else must have a parent. Racks and
    shelves can have numbered positions (`rack_size`, `rack_labels`) that the places inside sit in
    (`rack_slot`, DEC-034); lists sort with `comparePlaces` from `src/shared/api.ts`. The rack page's
    view is `src/web/components/RackView.tsx`; moves within a rack follow `rackMove` in
    `src/shared/rack.ts` on both server and screen (DEC-035).
  - `items.ts`: items, categories, search. Search uses an FTS5 table kept in sync by `indexItem`;
    any change to an item's searchable fields must call it.
  - `stock.ts`: adjust, recount, move, and stickered units (create, move, check out, check in); `moveEverything` (DEC-057)
    sends all a part has to one place in one undoable event.
  - `bulk.ts` (DEC-057): `POST /items/bulk` applies one change (category, move, tracking, delete) to each checked part on
    its own, in its own transaction with its own event, and reports which couldn't take it.
  - `projects.ts`: project kits (DEC-019). A kit is a `project` location that is never an item's or
    unit's home (`isProject` guards in items/stock/putback), which is what lets "return" send things back.
  - `putback.ts`, `pins.ts`, `backup.ts` (SQLite online backup + photo sync, nightly and on start),
    `housekeeping.ts` (hard-deletes items archived over 30 days ago, nightly and on start).
  - `events.ts`: activity log and undo.
  - `ai/` (DEC-048; on both instances since DEC-054, off wherever `AI_URL` is unset): `research.ts` is the data-fill pipeline (look at photos → read the part's
    own page → search only if that fails → extract), taking `chat`, `search`, `fetchPage`, `shops` and
    `readPhoto` as arguments so tests use fakes; `ollama.ts` and `search.ts` are the real ones (Ollama chat
    with a JSON schema, SearXNG + page text). `shops.ts` knows the six shops' links and page addresses
    (DEC-049); `mouser.ts` and `digikey.ts` read those two through their APIs when a key is set, and (DEC-053) a part number
    read off the part is tried at both before any web search, `mode: "quick"` is the photo alone for a likely name and category
    (the Needs details list runs it row by row), and a datasheet a shop page names is read with pdf.js (`pdfReader` in `search.ts`). On only when
    `createApi` gets `ai` (`AI_URL`, `AI_MODEL`, `SEARCH_URL`, the shop keys). The AI never writes: `POST /items/:id/research`
    returns suggestions, and accepted ones arrive through `PATCH /items/:id` with `aiFields` (source + time). `queue.ts` (DEC-055) is the in-process queue: parts queued at capture are
    looked up one at a time in the background, the answer stored on the item (`ai_result`), the job state on it too (`ai_job`),
    the change version bumped so screens refresh; `POST/DELETE /items/:id/research/queue`, `DELETE /items/:id/research`.
  - `changes.ts`: live updates (DEC-046). A middleware in `app.ts` bumps `Changes` after every
    successful non-GET request (backups excepted) with the writer's `X-Client` header;
    `GET /api/changes` streams them as server-sent events. Any new write route gets this for free.

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
the server uses them to validate `PUT /locations/:id/slot` (and `slot` on create), a box's `grid` size on
create/update (every placed bin must still fit, DEC-047), and `BoxGrid.tsx` uses them while dragging. Tiles show a bin's photo (`thumbUrl`) unless the box's `tileView` is `names` (DEC-036). A bin's name is optional (auto "Bin 0042", the next global ID, DEC-023); `BinSheet.tsx` is the sheet opened by tapping a bin on the grid (docked beside the grid on desktop); it leads with the bin's contents and never shows the sticker code (DEC-024), and `PhotoSpot.tsx` is a part's photo or, with none, a take-a-photo button, and `StickersView.tsx` is the Stickers screen (DEC-022; DEC-042 adds scanner mode and the choice moving to the next bare bin). `TakeOut.tsx` holds taking a bin out of its box and putting it back (DEC-028): the bin stays its box's child with its slot, and `out` on every `LocationSummary` says where it went. `WhereMap.tsx` is the Where block (DEC-038): a place's path as a numbered route down the left (a stop per place with its type icon, the box bold, the bin a coloured dot at the end), a small map of the box with the bin lit (`BoxMap`), the rack level as a stack (`RackMap`) and the bin's spot in words (`binWords`); the part page's place card and a bin's page (under the heading, `compact`) use it, and `/locations/:id?bin=` outlines that bin on the grid. Paths (`Crumb`) carry `type`, `rackSize` and `rackSlot` for it; numbered positions read as "level 3" (`positionText`).

### Web (`src/web/`)

- React 19, React Router, TanStack Query, Tailwind v4. `api.ts` is a thin `fetch` wrapper that
  throws `RequestError` and sends this tab's `clientId` as `X-Client` on every write; pages use
  `useQuery`/`useMutation` and invalidate queries after writes. `live.ts` (`useLiveUpdates`, mounted
  once in `App`) listens on `/api/changes` and invalidates every query when another device or tab
  writes, ignoring this tab's own echo; queries also refetch on window focus and reconnect (DEC-046).
- `App.tsx` holds the routes and the shell (bottom bar on phones, sidebar at `lg`). Each screen sits
  inside `ScreenErrorBoundary` (DEC-029). Write effects with a block body: an effect must return
  nothing or a clean-up function, and newer browsers' `scrollTo` returns a Promise.
- Home (`/`) is `InventoryPage.tsx` (DEC-026): every part from `GET /api/inventory` via
  `useInfiniteQuery` (key `["items", "inventory", …]`, so any `["items"]` invalidation refreshes it),
  filters kept in the URL, list or tile view in `localStorage`, pinned parts on top with − / +, and a
  pin button on every row and tile (DEC-032). Select (DEC-057) turns rows and tiles into checkboxes and shows
  `components/BulkBar.tsx` (category, move, counting, delete for the checked parts); `SearchPage.tsx` has the same.
  `LocationsPage.tsx` (`/locations`) is the old home: places, pinned places, project kits, and an
  All places list (`GET /api/locations?all=1`) with type chips (DEC-027). `LocationFormPage.tsx` (`/locations/new`) is
  the New location form; with `?many=1` (Add several, DEC-058) it stays after each save, a scan saves the place with
  that sticker, the name counts up or stays (`nextName` in `src/shared/names.ts`) and rack positions fill in order.
  `CapturePage.tsx` (`/capture`) is Quick capture: how it's counted is chosen there (an exact count of 1 unless
  changed, DEC-055) and "Look it up with AI after saving" queues the part. `SearchPage.tsx` lists only matches. `NeedsDetailsPage.tsx` (`/needs-details`, DEC-037) lists every
  part needing details as rows that save as you go; each row reads `["item", id]`, seeded from
  `GET /api/items/needs-details`, so stock toasts and Undo update it. It opens `ItemForm` (exported
  from `ItemEditPage.tsx`) in a popup; the form lays itself out by its own width (`@container`: two columns from 48 rem, DEC-051). `CategoryPicker.tsx` is the type-to-find category box used there
  and in the form. A part leaves Needs details only with a name and a category (`updateItem`).
- **Scanning** (`scan/`): `ScanProvider` installs one capture-phase `keydown` listener for the
  whole app. `detector.ts` (pure, unit-tested) tells scanner input from typing: a `Ctrl+B` prefix
  from the hardware scanner puts it in scan mode and swallows keys until Enter; a timing-burst
  fallback catches prefix-less scans and reports how many characters leaked into the focused
  field so they can be removed. The camera scanner is lazy-loaded and feeds the same `submit(code)`: `decode.ts` uses
  the browser's `BarcodeDetector` when it supports QR, else `zxing-wasm` (its `.wasm` is bundled via
  `?url`, no CDN); `camera.ts` (pure, unit-tested) picks the plain back lens and the guide crop.
  `CameraView.tsx` is the live preview that brackets what it sees and reports the code nearest
  the aim mark; it never acts by itself. `openCamera(options)` takes `tap` (wait for the Scan
  button; use it whenever the scan writes something), `title`, `hint`. `feedback.ts` beeps and
  buzzes (DEC-022). Pages that want to consume a scan call `useScanHandler` and return `true`, and show a `ScanTarget` (`scan/ScanTarget.tsx`, DEC-044): the magenta box that says what a scan does now, offers the camera or the scanner's trigger per `settings.ts` (`useScanMethod`), and tells the bar (`target` in the provider) so it shows the same words;
  the most recently mounted handler wins, and unhandled scans fall back to opening whatever was
  scanned via `/api/scan/:code`.
- **Print stickers** (`/stickers/print`, DEC-052): `src/shared/labels.ts` holds the sheet templates (points, from Colin's qr-label-creator), the Cricut re-grid (`printThenCut`), random codes and `layoutSheet`/`layoutPages`, which turn a page into plain rectangles and text in page coordinates; `pageSvg` draws that (the preview, and `web/labels/png.ts` rasterises it on a canvas for the Cricut), `web/labels/pdf.ts` draws it with pdf-lib for die-cut sheets. `PrintStickersPage.tsx` is the screen; the server's only part is `POST /api/stickers/check`. Codes are never recorded until scanned.
- `CategoriesPage.tsx` (`/categories`, DEC-056): categories and their fields, editable, saving as you go; a field keeps its key when renamed, so parts' values stay attached; `updateCategory`/`deleteCategory`/`categoryUsage` in `items.ts`.
- `SettingsPage.tsx` (`/settings`, DEC-043) holds the device-only preferences: `settings.ts` (scanning on this device: camera, scanner or both, DEC-044), the scan beep (`scan/feedback.ts`) and the theme (`theme.ts`), all in `localStorage`.
- Photos are resized on the device (`lib/photo.ts`) into a photo and a square thumbnail before upload;
  the server only stores JPEGs under `DATA_DIR/photos`. Each photo has a square crop (DEC-030):
  `CroppedPhoto` draws it from the original, `CropEditor` changes it and uploads a new square thumbnail.
  `PartPhotos` is the part page's photo block: main photo (DEC-031), strip, viewer, Crop, Delete.
- `public/sw.js` caches only the app shell and hashed assets, never `/api`, so stock data is
  always fresh.

### Docs

`framework/` holds the plan: PRD, data model, API contract, decision log (DEC-xxx), and the
AI-Context handoff. Keep them true when code changes (see "Keeping Docs True" in `AGENTS.md`).
`framework/kit/` holds material from the ai-framework kit that is not specific to this app: the
discovery question set, the UI-prompt template, the kit changelog, and the demo project.
