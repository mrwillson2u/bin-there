# AI-Context.md

> **Purpose:** This is the entry point for any AI tool working on this project.
> The Project Summary below is the **only section that must be read every session** — pull deeper docs on demand using the reading map.

---

## Project Summary

*(Populated during Phase 0; SPV and ship date added during Phase 6. Keep this current — it outlives the other docs.)*

| Attribute | Value |
|-----------|-------|
| **Project Name** | Bin→There (DEC-011; written with the arrow since DEC-045; code slug `bin-there`; formerly the working name Stack-n-Track) |
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

*Last updated 2026-11-06, after shipping the SPV and adding delete (DEC-013), the grid view (DEC-014), the four backlog quick wins (DEC-015 to DEC-018), project kits (DEC-019), the quick box-filling flow (DEC-020), the camera scanner rebuild (DEC-021), the tap-to-scan Stickers screen (DEC-022), global fixed-width bin IDs (DEC-023), content-first screens (DEC-024), the user-story flow review (DEC-025), Inventory as home (DEC-026), the all-places list, move-by-list and more categories (DEC-027), taking a bin out of its box (DEC-028), a fix for the black page after leaving Inventory (DEC-029), square photos with an adjustable crop (DEC-030), the reworked part page with a main photo (DEC-031), the clearer place picker plus pinning from Inventory (DEC-032), positions for places in a rack (DEC-033), racks with a size and drag-to-arrange positions (DEC-034), dropping that moves the others along with a sliding preview (DEC-035), photos on bin tiles (DEC-036), the Fill in details page with a type-in category box (DEC-037), where-a-part-is as a numbered route with a map of the box (DEC-038), the AI deploying itself (DEC-039), a dev branch with a dev instance (DEC-040), the quieter grid tiles (DEC-041), stickering by scanner with the choice moving on by itself (DEC-042), a Settings screen (DEC-043), one scan language with a magenta scan target on every scanning screen (DEC-044), screens that update themselves when another device changes something (DEC-046), and the count under the part's name, Move in the bin pane and a box's grid size (DEC-047).*

### Where things run

| What | Where |
|------|-------|
| **Live app** | `https://ubuntubot.llama-arctic.ts.net:8443` (tailnet only). Port 8443 because Wazuh owns 443 on ubuntubot |
| **Server** | `ubuntubot` (Ubuntu 22.04, x86_64, Docker 28 + Compose v2, GTX 1080 Ti 11 GB). SSH as `colin` via MagicDNS or `ubuntubot.local`. `sudo` needs Colin's password, so he runs sudo commands himself |
| **Production folder** | `~/bin-there-prod` on ubuntubot (a git checkout, only ever `main`, only touched to deploy; renamed from `~/bin-there` on 2026-11-07, DEC-050). Containers `bin-there` (bound to `127.0.0.1:3000`) and, since DEC-054, `bin-there-ollama` (the AI's model container, on the GPU, shared with the dev instance over the live stack's compose network); `.env` there sets `BACKUP_PATH`, `TZ=America/Los_Angeles` and the shop API keys (not in git) |
| **Live data** | `~/bin-there-prod/data` on ubuntubot (`app.db` + `photos/`) |
| **Development folder** | `~/bin-there` on ubuntubot: one checkout, branches switched freely (on `dev` now; the `ai` branch was merged into `dev` on 2026-11-07 and its folder removed, DEC-050). The dev instance runs from it: `compose.dev.yaml` = container `bin-there-dev` on `127.0.0.1:3001` with `AI_URL`/`SEARCH_URL` set, using the live stack's `bin-there-ollama` over its compose network (DEC-054; the models in the `bin-there-ai_ollama-models` volume, `gemma4:e4b` the default since DEC-053); data a throwaway copy of the live backup (`scripts/dev-data-refresh.sh`); shop API keys in its `.env` (`MOUSER_API_KEY` set and verified 2026-11-07; `DIGIKEY_CLIENT_ID`/`_SECRET` from a production app with Product Information V4, verified 2026-11-08). If AI answers take minutes, the Ollama container has lost the GPU: `docker exec bin-there-ollama nvidia-smi -L` says "Failed to initialize NVML"; `docker compose -f compose.dev.yaml restart ollama` fixes it. The cause is systemd reloading (package updates); since 2026-11-08 the compose file names the card's device files so a reload shouldn't take them away (to prove it: Colin runs `sudo systemctl daemon-reload`, then the `nvidia-smi -L` line above should still show the card). SearXNG is Colin's own container on `:8989`. Phone: `https://ubuntubot.llama-arctic.ts.net:8444` once Colin runs `sudo tailscale serve --bg --https=8444 3001` (DEC-040); port 8445 (the old ai instance) can be turned off with `sudo tailscale serve --https=8445 off` |
| **Backups** | `~/bin-there-backups` on ubuntubot: nightly 03:00, newest 14 snapshots + all photos. Same disk as the app (no second drive; the other partitions are Windows/BitLocker). Restore tested on the server 2026-11-03 |
| **Code** | GitHub `mrwillson2u/bin-there` (private), branch `main` |
| **Old Mac copy** | `~/Projects/stack-n-track` on `macbip-pro`. **Stopped and no longer served; its data is stale. Don't restart it against `./data`.** It's a dev checkout now |

### Deploying a change

Two speeds since 2026-11-06 (DEC-040). **Dev:** work in `~/bin-there` on `dev`; per change run typecheck, `npm test` and the one browser check for the screen touched, then `docker compose -f compose.dev.yaml up -d --build` (port 3001). **Live:** when a set of changes is ready, run the full suite and the story walk on a scratch copy, then in `~/bin-there-prod`: back up, `git pull`, `git merge --ff-only origin/dev`, push, `docker compose up -d --build` (the image build runs the tests and refuses to ship if they fail), check `/api/health`. The AI does both itself (DEC-039).

```bash
cd ~/bin-there-prod
curl -s -X POST localhost:3000/api/backup
git pull
docker compose up -d --build
```

Tailscale Serve config persists across reboots; it was set once with `sudo tailscale serve --bg --https=8443 3000`. Full details: `DEPLOY.md`.

### Developing

`npm install`, then `npm test` (Vitest, 112 tests) and `npm run build`. For a throwaway copy: `PORT=3011 DATA_DIR=/tmp/bt-test npm start`. Schema changes: edit `src/server/db/schema.ts`, run `npm run db:generate`, and check the migration against an old-shaped database (see the migration test in `src/server/app.test.ts`). Code map: `README.md`.

### What's built

PRD F1–F8 (the SPV) plus F10 check out/in, F11 pins, F12 sites, F13 find-it in put-back, delete/archive (DEC-013, 2026-11-03), the grid view of gridded boxes with drag-and-drop bin placement (DEC-014, 2026-11-03), the staleness review list, low-stock list, nightly purge of old deletions, and light mode (DEC-015 to DEC-018, 2026-11-03), project kits (DEC-019, 2026-11-03), quick filling of a gridded box: palette of new bins, contents on the tile, a bin sheet for adding parts (DEC-020, 2026-11-03), a rebuilt camera scanner (zxing-wasm or the browser's BarcodeDetector, plain back lens, lens button; DEC-021), a Stickers screen with a camera preview above the grid where you tap a bin, aim, and tap Scan, with brackets round what the camera sees, beep and buzz, move-a-sticker and Undo (DEC-022), global fixed-width bin IDs, Bin 0001 (DEC-023, migration 0008), content-first screens: the bin sheet leads with the part's photo, name and count, sticker codes appear only on a location's own page, location pages put sticker/move/delete at the bottom and can rename, and on desktop a bin opens beside the grid (DEC-024), a scan never writes without the screen saying so, paths that keep the bin visible, and pick-from-list that opens beside the part (DEC-025), Inventory as home: every part with search, filter chips with counts (needs details, running low, checked out, counts to check) plus category and kind, sort, list or tile view, pinned parts on top with − / +, 60 at a time as you scroll; the old home is the Locations tab; Search lists only matches (DEC-026, `GET /api/inventory`), Locations has an All places list (every bin, box and tote with type chips and find), places can be moved by picking from a list, the bin quick view has no delete, empty bins say "Empty", and nine more starter categories (migration 0009; DEC-027), bins taken out of their box to a project kit or with a note, keeping their grid spot (grey and striped on the grid), put back by a tap, from the kit or by a put-back scan, with "Free its spot" to give the spot up, and a bin scanned on a kit's screen offering "Take the whole bin" (migration 0010; DEC-028), a screen that crashes shows a message with Reload instead of a black page (DEC-029), photos shown as squares everywhere with Crop on the photo, the original kept (migration 0011; DEC-030), the part's page leading with its name and a photo strip with a main photo, Use as main and Delete (migration 0012; DEC-031), a place picker where tapping a row looks inside and Choose picks it, and pin buttons on Inventory rows and tiles (DEC-032), racks and shelves with a size and numbered positions (renameable), filled by tapping an empty one and arranged by dragging (the others move along and slide into place while you drag), shown in lists and paths (migrations 0013–0015; DEC-033 to DEC-035), bin tiles that show the part's photo framed in the bin's colour, with a per-box Photos/Names switch (migration 0016; DEC-036), a Fill in details page for every part on the Needs details list (each row saves as you go: name, a category box you can type in, how it's counted, how many; the full form in a popup), amounts per place in the details form with the number box labelled as the low-stock warning, and a part leaving Needs details only with a name and a category (migration 0017; DEC-037), a part's Where card that reads as a route: a numbered stop per place down the left with the box in bold, a small map of the box with the bin the only one in colour (tap it to open the box with the bin outlined), the spot in words, rack positions as "level 3" with a thin stack of levels, the bin's number last and small, the same on a bin's own page (DEC-038), grid tiles drawn quietly: the bin colour as a 3 px outline round a dark tint of it, one small white type for every name, square photos never stretched with one per cell and its own name strip when a bin holds several, the chosen bin ringed in white with the others veiled, 3 px gutters, and on a desktop the bin's pane opening when you arrive from a part's route map (DEC-041), the Stickers screen choosing the next bin without a sticker after each one goes on, with a Camera / Scanner switch: scanner mode drops the camera for a Next up panel and a Skip button, so a box is one tap then scan, scan, scan (DEC-042), a Settings screen (sidebar, or the link at the bottom of Locations) for how the Stickers screen starts (Camera, Scanner, Scanner only), the beep and appearance, all kept on the device (DEC-043), one scan language: "Scanning on this device" (camera, scanner or both) decides what every scan button offers and whether the camera ever opens to scan, a magenta `ScanTarget` on every screen where a scan does something saying what it does, and the bar turning magenta with the same words (DEC-044), screens that update themselves when another device (or tab) changes something, over one server-sent change stream per open screen plus a refetch on coming back into view (DEC-046), the part page's count row under its name (one per place, above the photos), Move on every part in the bin pane, and a gridded box's grid size set on the form or changed on its page, refused when a placed bin wouldn't fit (DEC-047), a desktop/Pi layout (sidebar + two columns at ≥1024 px), and home-screen install (PWA). Scanner: a HW0006 Pro programmed with a Ctrl+B prefix (verified); its `&END!` suffix is stripped. iPhone camera scanning verified over HTTPS.

### Shipped 2026-11-03

All SPV checks done on 2026-11-03: Colin used it for real on the phone (quick-capture photos work on the real camera), the home-screen icon points at ubuntubot, and DEC-001/003/004/007 are accepted. Marked shipped in `09-Process-Guide.md`.

### Next up (post-ship, Colin's interest)

- **AI data fill** (DEC-048, on `dev` since 2026-11-07; shipped to the live app on 2026-11-12 with the model container moved to the production compose file and shared with the dev instance (DEC-054), Gemma 4 e4b on both; **DEC-053, 2026-11-11, on `dev`**: part numbers read off the part go to Mouser and Digi-Key, quick naming over the Needs details list, the datasheet read; the 12B model tried 2026-11-12: modestly better judgement at twice the time, reads part numbers no better, and needs the card to itself, so Colin kept the 4B; a five-model bake-off the same day (DEC-053) found Gemma 4 e4b the best reader of printed numbers and the least inventive, at 8–10 s a part and ~5.5 GB of the card, with the choice of default Colin's; next, capture-time reading; after the bake-off Colin chose Gemma 4 e4b and the AI beside the live app to test for a while (Q96, 2026-11-12); **DEC-055 (2026-11-12)**: counting chosen at capture, an exact count of 1 by default, and parts queued for the AI at capture with the answer kept on the part, queue status and Cancel on the form and on Fill in details; **DEC-056 (2026-11-12)**: a Categories screen where categories and their fields are edited, a renamed field keeping its key and the parts' values; **DEC-057 (2026-11-12)**: bulk editing, Select on Inventory and Search with a bar to set the category, move everything the checked parts have to one place, set the counting or delete, one undoable entry per part; **DEC-058 (2026-11-12)**: Add several places in a run, name, scan, next, with the settings staying between saves; **DEC-059 (2026-11-12)**: choice fields, a category field with a fixed list of options, a drop-down on the form, the AI picking from them or leaving it; **DEC-060 (2026-11-12)**: text fields on the form offer the values the category's parts already hold; **third ship, 2026-11-12** (Q105): DEC-055 to DEC-060 shipped to the live app, backup `2026-11-12_160213` taken first (22 parts, 47 photos), `main` fast-forwarded to `dev` at 01066d4, container rebuilt, healthy, migration 0019 applied on the live database; next: reading the label at capture time, and Colin's notes on which parts the AI gets wrong): built and checked with a fake model; the real runs read printed labels well (Adafruit bags word for word, one digit misread), invented nothing once the record was kept out of the photo step, and the web search was blocked (SearXNG's engines suspended). A printed adafru.it/sparkfun link is fetched directly and settles supplier, number and page. **DEC-049 (2026-11-06):** the look-up now reads the shop's own page first, the link on record or the page built from supplier + part number for Colin's six shops (Mouser, Digi-Key, Amazon, Adafruit, SparkFun, LCSC), and only searches when it can't; Mouser and Digi-Key go through their free APIs once Colin registers for keys (none set yet, so those two currently say so and fall back). Checked with fakes, the browser check, and a real run on the :3002 instance against Adafruit, LCSC, SparkFun and Amazon pages (6–11 s a part; name, category, supplier, number and price from the page; see DEC-049 for the three guards that run added). Mouser verified live on 2026-11-07 (a 2018 Search API key still works: a Mouser link came back with name, category, 485-1938 and $4.95 in 9 s). **Shipped to the live app 2026-11-12** (backup `2026-11-12_000830`, `main` at 2be9c4e, both containers up, the AI answering on the live app with Gemma 4 e4b) and before that **2026-11-11** (backup `2026-11-11_195410`, `main` fast-forwarded to `dev` at 27d0a80, container rebuilt, healthy): the AI data fill code (off there), the two-column details form and the desktop audit (DEC-051), and Print stickers. **Print stickers** (DEC-052, 2026-11-11): the qr-label-creator port, both outputs, checked in the browser; Design Space accepts the Cricut image (the box one image may fill on a Maker with Letter paper is 6.76 × 9.26 in, learned the hard way: 56 SL588 upright, 60 turned); the first real sheet cut well on the Maker 3 (Printable Vinyl, Less pressure). Digi-Key verified live on 2026-11-08 after Colin made a production app (the sandbox key was refused); that run found and fixed two bugs in the Digi-Key routes (see DEC-049). Next: a run over his Needs details list with links pasted in, try it from the phone, then decide whether it earns a place on `dev`. Ideas after that: a sparkle per Fill in details row, a run over the whole list, "you already have these" at capture time, name-from-photo at capture.
- **Photo search** (identify a part from a photo): plan in `reports/Self hosted photo part search.md`, hardware notes in the PRD backlog. Step 1 is Phase 0: an offline script scoring ~50 of Colin's parts, photographed in two sessions, against the catalog (DINOv3 embeddings on CPU, no GPU needed). Go bar: right item in the top 5 for ≥80% of modules/ICs/connectors and ≥70% overall, and it must beat the "recently taken out" list. Not started; needs Colin's photos. For the VLM half: Ollama on ubuntubot (not installed yet); take down the unused `neutts` container (holds 5 GB of VRAM) to fit the 8B Qwen.
- **UI flow review** (`reports/UI flow review 2026-11-03.md`): ranked proposals. The first two are done: Q47 kept the needs-details rule (name and category), and "save and next" became the Fill in details page (DEC-037). The Where card was redone as directions on 2026-11-06 (DEC-038); a word per rack other than "level" is a possible follow-up. Moving a part from the bin pane is done (DEC-047); next is changing a level from a list. Rerun `scripts/ui-checks/stories-walk.mjs` (and `inventory-check.mjs` for the home screen) after UI changes.
- Other backlog: `02-PRD.md` → Post-Ship Backlog (viewer access, Pi station, AI data fill, BOM check…). Small follow-ups noticed while building: none open (a box's grid size is on its page since DEC-047).
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
