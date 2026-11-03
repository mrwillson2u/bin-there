# AI-Context.md

> **Purpose:** This is the entry point for any AI tool working on this project.
> The Project Summary below is the **only section that must be read every session** — pull deeper docs on demand using the reading map.

---

## Project Summary

| Attribute | Value |
|-----------|-------|
| **Project Name** | TaskFlow |
| **Project Type** | Web application (SaaS, PWA) |
| **One-liner** | The task app that gets out of your way. |
| **Current Phase** | 🟡 Phase 7: Ship — building the SPV |
| **SPV** | Auth + task CRUD + projects + Today View + timer, live at taskflow.app |
| **Ship Date** | 2025-04-17 |
| **Tech Stack** | Next.js + Tailwind + Zustand, Supabase (PostgreSQL/auth), Vercel |
| **Top Open Decisions** | Time-entry granularity; recurring-tasks approach (both deferred — see 09-Process-Guide.md) |
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

---

## Cross-References

- Architecture decisions reference entries in `08-Decision-Log.md` by ID (e.g., DEC-001)
- PRD features map to API endpoints in `07-API-Contract.md`
- Data Model entities are referenced in both Architecture and API docs
- Visual Style Guide tokens are used in UX Framework component specs
- Phase progress and the Ship Target are tracked in `09-Process-Guide.md`

---

## AI Instructions

Facilitation and behavior rules live in **`AGENTS.md`** (canonical). Discovery is complete — this project is in Phase 7 (Ship). When implementing:

- Open each session by stating ship status in one line (days to 2025-04-17)
- Follow the tech stack defined in `05-System-Architecture.md` (Next.js, Supabase, Vercel)
- Follow tokens and patterns in `04-Visual-Style-Guide.md` for UI
- Check `02-PRD.md` for scope before adding features — non-SPV additions go to the Post-Ship Backlog
- Reference `06-Data-Model.md` and `07-API-Contract.md` for data/API work
- Log all significant decisions in `08-Decision-Log.md`

### Formatting Standards

- Use consistent markdown: H1 for doc title, H2 for sections, H3 for subsections
- Keep tables aligned and readable
- Date format: YYYY-MM-DD
