# AI-Context.md

> **Purpose:** This is the entry point for any AI tool working on this project.
> The Project Summary below is the **only section that must be read every session** — pull deeper docs on demand using the reading map.

---

## Project Summary

*(Populated during Phase 0; SPV and ship date added during Phase 6. Keep this current — it outlives the other docs.)*

| Attribute | Value |
|-----------|-------|
| **Project Name** | Bin There (DEC-011; formerly the working name Stack-n-Track) |
| **Project Type** | Web app (personal / single user) |
| **One-liner** | An inventory app for a home garage workshop, so I can find and keep track of the things I own. |
| **Current Phase** | **Shipped 2026-11-03.** Post-ship: the numbered docs are now advisory; keep this summary and the Decision Log current |
| **SPV** | PRD F1–F8 live on iPhone via Tailscale HTTPS (see Ship Target in 09-Process-Guide.md) |
| **Ship Date** | 2026-11-23 (shipped 2026-11-03) |
| **Tech Stack** | TypeScript: React 19 (Vite PWA) + Hono on Node 22 + SQLite/Drizzle (FTS5), one Docker container on ubuntubot, via Tailscale Serve (DEC-004) |
| **Top Open Decisions** | Whether to start photo-search Phase 0 (post-ship) |
| **Kit Version** | 1.1.0 |

---

## Handoff (current state; keep this updated at the end of each session)

*Last updated 2026-11-06, after shipping the SPV and adding delete (DEC-013), the grid view (DEC-014), the four backlog quick wins (DEC-015 to DEC-018), project kits (DEC-019), the quick box-filling flow (DEC-020), the camera scanner rebuild (DEC-021), the tap-to-scan Stickers screen (DEC-022), global fixed-width bin IDs (DEC-023), content-first screens (DEC-024), the user-story flow review (DEC-025), Inventory as home (DEC-026), the all-places list, move-by-list and more categories (DEC-027), taking a bin out of its box (DEC-028), a fix for the black page after leaving Inventory (DEC-029), square photos with an adjustable crop (DEC-030), the reworked part page with a main photo (DEC-031), the clearer place picker plus pinning from Inventory (DEC-032), positions for places in a rack (DEC-033), racks with a size and drag-to-arrange positions (DEC-034), dropping that moves the others along with a sliding preview (DEC-035), photos on bin tiles (DEC-036), the Fill in details page with a type-in category box (DEC-037), where-a-part-is as a numbered route with a map of the box (DEC-038), the AI deploying itself (DEC-039), and a dev branch with a dev instance (DEC-040).*

### Where things run

| What | Where |
|------|-------|
| **Live app** | `https://ubuntubot.llama-arctic.ts.net:8443` (tailnet only). Port 8443 because Wazuh owns 443 on ubuntubot |
| **Server** | `ubuntubot` (Ubuntu 22.04, x86_64, Docker 28 + Compose v2, GTX 1080 Ti 11 GB). SSH as `colin` via MagicDNS or `ubuntubot.local`. `sudo` needs Colin's password, so he runs sudo commands himself |
| **App folder** | `~/bin-there` on ubuntubot (a git checkout). Container `bin-there`, bound to `127.0.0.1:3000`; `.env` there sets `BACKUP_PATH` and `TZ=America/Los_Angeles` (not in git) |
| **Live data** | `~/bin-there/data` on ubuntubot (`app.db` + `photos/`) |
| **Dev instance** | `~/bin-there-dev` on ubuntubot, branch `dev`, container `bin-there-dev` on `127.0.0.1:3001` (`compose.dev.yaml`), data a throwaway copy of the live backup (`scripts/dev-data-refresh.sh`). Phone: `https://ubuntubot.llama-arctic.ts.net:8444` once Colin runs `sudo tailscale serve --bg --https=8444 3001` (DEC-040) |
| **Backups** | `~/bin-there-backups` on ubuntubot: nightly 03:00, newest 14 snapshots + all photos. Same disk as the app (no second drive; the other partitions are Windows/BitLocker). Restore tested on the server 2026-11-03 |
| **Code** | GitHub `mrwillson2u/bin-there` (private), branch `main` |
| **Old Mac copy** | `~/Projects/stack-n-track` on `macbip-pro`. **Stopped and no longer served; its data is stale. Don't restart it against `./data`.** It's a dev checkout now |

### Deploying a change

Two speeds since 2026-11-06 (DEC-040). **Dev:** work in `~/bin-there-dev` on `dev`; per change run typecheck, `npm test` and the one browser check for the screen touched, then `docker compose -f compose.dev.yaml up -d --build` (port 3001). **Live:** when a set of changes is ready, run the full suite and the story walk on a scratch copy, then in `~/bin-there`: back up, `git pull`, `git merge --ff-only origin/dev`, push, `docker compose up -d --build` (the image build runs the tests and refuses to ship if they fail), check `/api/health`. The AI does both itself (DEC-039).

```bash
cd ~/bin-there
curl -s -X POST localhost:3000/api/backup
git pull
docker compose up -d --build
```

Tailscale Serve config persists across reboots; it was set once with `sudo tailscale serve --bg --https=8443 3000`. Full details: `DEPLOY.md`.

### Developing

`npm install`, then `npm test` (Vitest, 108 tests) and `npm run build`. For a throwaway copy: `PORT=3001 DATA_DIR=/tmp/bt-test npm start`. Schema changes: edit `src/server/db/schema.ts`, run `npm run db:generate`, and check the migration against an old-shaped database (see the migration test in `src/server/app.test.ts`). Code map: `README.md`.

### What's built

PRD F1–F8 (the SPV) plus F10 check out/in, F11 pins, F12 sites, F13 find-it in put-back, delete/archive (DEC-013, 2026-11-03), the grid view of gridded boxes with drag-and-drop bin placement (DEC-014, 2026-11-03), the staleness review list, low-stock list, nightly purge of old deletions, and light mode (DEC-015 to DEC-018, 2026-11-03), project kits (DEC-019, 2026-11-03), quick filling of a gridded box: palette of new bins, contents on the tile, a bin sheet for adding parts (DEC-020, 2026-11-03), a rebuilt camera scanner (zxing-wasm or the browser's BarcodeDetector, plain back lens, lens button; DEC-021), a Stickers screen with a camera preview above the grid where you tap a bin, aim, and tap Scan, with brackets round what the camera sees, beep and buzz, move-a-sticker and Undo (DEC-022), global fixed-width bin IDs, Bin 0001 (DEC-023, migration 0008), content-first screens: the bin sheet leads with the part's photo, name and count, sticker codes appear only on a location's own page, location pages put sticker/move/delete at the bottom and can rename, and on desktop a bin opens beside the grid (DEC-024), a scan never writes without the screen saying so, paths that keep the bin visible, and pick-from-list that opens beside the part (DEC-025), Inventory as home: every part with search, filter chips with counts (needs details, running low, checked out, counts to check) plus category and kind, sort, list or tile view, pinned parts on top with − / +, 60 at a time as you scroll; the old home is the Locations tab; Search lists only matches (DEC-026, `GET /api/inventory`), Locations has an All places list (every bin, box and tote with type chips and find), places can be moved by picking from a list, the bin quick view has no delete, empty bins say "Empty", and nine more starter categories (migration 0009; DEC-027), bins taken out of their box to a project kit or with a note, keeping their grid spot (grey and striped on the grid), put back by a tap, from the kit or by a put-back scan, with "Free its spot" to give the spot up, and a bin scanned on a kit's screen offering "Take the whole bin" (migration 0010; DEC-028), a screen that crashes shows a message with Reload instead of a black page (DEC-029), photos shown as squares everywhere with Crop on the photo, the original kept (migration 0011; DEC-030), the part's page leading with its name and a photo strip with a main photo, Use as main and Delete (migration 0012; DEC-031), a place picker where tapping a row looks inside and Choose picks it, and pin buttons on Inventory rows and tiles (DEC-032), racks and shelves with a size and numbered positions (renameable), filled by tapping an empty one and arranged by dragging (the others move along and slide into place while you drag), shown in lists and paths (migrations 0013–0015; DEC-033 to DEC-035), bin tiles that show the part's photo framed in the bin's colour, with a per-box Photos/Names switch (migration 0016; DEC-036), a Fill in details page for every part on the Needs details list (each row saves as you go: name, a category box you can type in, how it's counted, how many; the full form in a popup), amounts per place in the details form with the number box labelled as the low-stock warning, and a part leaving Needs details only with a name and a category (migration 0017; DEC-037), a part's Where card that reads as a route: a numbered stop per place down the left with the box in bold, a small map of the box with the bin the only one in colour (tap it to open the box with the bin outlined), the spot in words, rack positions as "level 3" with a thin stack of levels, the bin's number last and small, the same on a bin's own page (DEC-038), a desktop/Pi layout (sidebar + two columns at ≥1024 px), and home-screen install (PWA). Scanner: a HW0006 Pro programmed with a Ctrl+B prefix (verified); its `&END!` suffix is stripped. iPhone camera scanning verified over HTTPS.

### Shipped 2026-11-03

All SPV checks done on 2026-11-03: Colin used it for real on the phone (quick-capture photos work on the real camera), the home-screen icon points at ubuntubot, and DEC-001/003/004/007 are accepted. Marked shipped in `09-Process-Guide.md`.

### Next up (post-ship, Colin's interest)

- **Photo search** (identify a part from a photo): plan in `reports/Self hosted photo part search.md`, hardware notes in the PRD backlog. Step 1 is Phase 0: an offline script scoring ~50 of Colin's parts, photographed in two sessions, against the catalog (DINOv3 embeddings on CPU, no GPU needed). Go bar: right item in the top 5 for ≥80% of modules/ICs/connectors and ≥70% overall, and it must beat the "recently taken out" list. Not started; needs Colin's photos. For the VLM half: Ollama on ubuntubot (not installed yet); take down the unused `neutts` container (holds 5 GB of VRAM) to fit the 8B Qwen.
- **UI flow review** (`reports/UI flow review 2026-11-03.md`): ranked proposals. The first two are done: Q47 kept the needs-details rule (name and category), and "save and next" became the Fill in details page (DEC-037). The Where card was redone as directions on 2026-11-06 (DEC-038); a word per rack other than "level" is a possible follow-up. Next there is moving a part from the bin pane. Rerun `scripts/ui-checks/stories-walk.mjs` (and `inventory-check.mjs` for the home screen) after UI changes.
- Other backlog: `02-PRD.md` → Post-Ship Backlog (viewer access, Pi station, AI data fill, BOM check…). Small follow-ups noticed while building: no screen yet to change a box's grid size (renaming a location is on its page since DEC-024).
- Backups should eventually move to Colin's main backup system (borgmatic on ubuntubot, currently being fixed).

---

## Reading Map

All framework documents are in the `framework/` directory. Read by task — not front to back:

| Task | Read |
|------|------|
| Every session | Project Summary above (this file only) |
| UI / frontend work | `03-UX-Framework.md`, `04-Visual-Style-Guide.md` |
| API / backend work | `06-Data-Model.md`, `07-API-Contract.md` |
| Architecture / infra work | `05-System-Architecture.md` |
| Scope questions ("should we build X?") | `02-PRD.md` (MVP scope + Post-Ship Backlog), Ship Target in `09-Process-Guide.md` |
| Why was X chosen? | `08-Decision-Log.md` |
| Product/vision context | `01-Concept.md` |
| Phase status, skipped/deferred items | `09-Process-Guide.md` |
| Generating UI-tool prompts | `kit/10-UI-Generation-Prompt.md` |
| Discovery questions | `kit/starter_questions.md` |

---

## Cross-References

- Architecture decisions reference entries in `08-Decision-Log.md` by ID (e.g., DEC-001)
- PRD features map to API endpoints in `07-API-Contract.md`
- Data Model entities are referenced in both Architecture and API docs
- Visual Style Guide tokens are used in UX Framework component specs
- Phase progress and the Ship Target are tracked in `09-Process-Guide.md`

---

## AI Instructions

Facilitation and behavior rules live in **`AGENTS.md`** (canonical) — discovery flow, batching, skip/defer, ship discipline, staleness handling. Do not follow a doc that contradicts the code or a logged decision; flag and fix it (see "Keeping Docs True" in `AGENTS.md`).

### Formatting Standards

- Use consistent markdown: H1 for doc title, H2 for sections, H3 for subsections
- Keep tables aligned and readable
- Use `[TODO]` markers for unfilled sections; `[STALE]` for sections known to be out of date
- Date format: YYYY-MM-DD
