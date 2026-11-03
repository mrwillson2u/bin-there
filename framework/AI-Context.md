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

*Last updated 2026-11-03, after shipping the SPV.*

### Where things run

| What | Where |
|------|-------|
| **Live app** | `https://ubuntubot.llama-arctic.ts.net:8443` (tailnet only). Port 8443 because Wazuh owns 443 on ubuntubot |
| **Server** | `ubuntubot` (Ubuntu 22.04, x86_64, Docker 28 + Compose v2, GTX 1080 Ti 11 GB). SSH as `colin` via MagicDNS or `ubuntubot.local`. `sudo` needs Colin's password, so he runs sudo commands himself |
| **App folder** | `~/bin-there` on ubuntubot (a git checkout). Container `bin-there`, bound to `127.0.0.1:3000`; `.env` there sets `BACKUP_PATH` and `TZ=America/Los_Angeles` (not in git) |
| **Live data** | `~/bin-there/data` on ubuntubot (`app.db` + `photos/`) |
| **Backups** | `~/bin-there-backups` on ubuntubot: nightly 03:00, newest 14 snapshots + all photos. Same disk as the app (no second drive; the other partitions are Windows/BitLocker). Restore tested on the server 2026-11-03 |
| **Code** | GitHub `mrwillson2u/bin-there` (private), branch `main` |
| **Old Mac copy** | `~/Projects/stack-n-track` on `macbip-pro`. **Stopped and no longer served; its data is stale. Don't restart it against `./data`.** It's a dev checkout now |

### Deploying a change

On ubuntubot: back up, pull, rebuild (the image build runs the tests and refuses to ship if they fail).

```bash
cd ~/bin-there
curl -s -X POST localhost:3000/api/backup
git pull
docker compose up -d --build
```

Tailscale Serve config persists across reboots; it was set once with `sudo tailscale serve --bg --https=8443 3000`. Full details: `DEPLOY.md`.

### Developing

`npm install`, then `npm test` (Vitest, 56 tests) and `npm run build`. For a throwaway copy: `PORT=3001 DATA_DIR=/tmp/bt-test npm start`. Schema changes: edit `src/server/db/schema.ts`, run `npm run db:generate`, and check the migration against an old-shaped database (see the migration test in `src/server/app.test.ts`). Code map: `README.md`.

### What's built

PRD F1–F8 (the SPV) plus F10 check out/in, F11 pins, F12 sites, F13 find-it in put-back, delete/archive (DEC-013, 2026-11-03), a desktop/Pi layout (sidebar + two columns at ≥1024 px), and home-screen install (PWA). Scanner: a HW0006 Pro programmed with a Ctrl+B prefix (verified); its `&END!` suffix is stripped. iPhone camera scanning verified over HTTPS.

### Shipped 2026-11-03

All SPV checks done on 2026-11-03: Colin used it for real on the phone (quick-capture photos work on the real camera), the home-screen icon points at ubuntubot, and DEC-001/003/004/007 are accepted. Marked shipped in `09-Process-Guide.md`.

### Next up (post-ship, Colin's interest)

- **Photo search** (identify a part from a photo): plan in `reports/Self hosted photo part search.md`, hardware notes in the PRD backlog. Step 1 is Phase 0: an offline script scoring ~50 of Colin's parts, photographed in two sessions, against the catalog (DINOv3 embeddings on CPU, no GPU needed). Go bar: right item in the top 5 for ≥80% of modules/ICs/connectors and ≥70% overall, and it must beat the "recently taken out" list. Not started; needs Colin's photos. For the VLM half: Ollama on ubuntubot (not installed yet); take down the unused `neutts` container (holds 5 GB of VRAM) to fit the 8B Qwen.
- Other backlog: `02-PRD.md` → Post-Ship Backlog (F9 bulk move of selected items, grid view, viewer access, Pi station, AI data fill…).
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
