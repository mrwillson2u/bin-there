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
| **Current Phase** | Phase 7 — Ship (building toward the SPV) |
| **SPV** | PRD F1–F8 live on iPhone via Tailscale HTTPS (see Ship Target in 09-Process-Guide.md) |
| **Ship Date** | 2026-11-23 |
| **Tech Stack** | TypeScript: React (Vite PWA) + Hono + SQLite/Drizzle, one Docker container on the home lab server, via Tailscale Serve *(proposed, DEC-004)* |
| **Top Open Decisions** | Confirm the proposed decisions DEC-001 (exact/level tracking), DEC-003 (Tailscale access), DEC-004 (stack); AI features vs. $0 cost (post-ship) |
| **Kit Version** | 1.1.0 |

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
| Generating UI-tool prompts | `10-UI-Generation-Prompt.md` |
| Discovery questions | `ProcessGuide/starter_questions.md` |

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
