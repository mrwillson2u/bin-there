# Process Guide

> **Purpose:** Ship target, phase tracker, and current project state.

---

## Ship Target

*(Set during Phase 6. This is the project's definition of done — see Ship Discipline in `AGENTS.md`.)*

| Attribute | Value |
|-----------|-------|
| **Smallest Publishable Version (SPV)** | PRD **F1–F8** working on my iPhone: scan by **camera** on the iPhone, and by the **hardware scanner on a desktop/Pi browser**; nested locations with stickers; items with exact/level stock; search with full location path; +/− and single-item move with undo; quick capture + Needs details; Put-back mode; activity log; nightly backup with one successful restore test. Installed to the iPhone home screen. |
| **Ship Date** | **2026-11-23** (committed 2026-11-02) |
| **Deploy Target / Domain** | Docker on the home lab server (Ubuntu), served over HTTPS by **Tailscale Serve** at a `*.ts.net` address; reached from the iPhone over cell + Tailscale (DEC-003) |
| **Status** | On track |

After the SPV is defined: scope additions go to the Post-Ship Backlog in `02-PRD.md` unless they block the SPV (DEC-XXX entry required). If the date passes, cut scope rather than extend — date extensions also require a DEC-XXX entry.

---

## Project Context

| Attribute | Value |
|-----------|-------|
| **Project Type** | Web app (personal, single user) |
| **Scope** | New project — fresh start. A previous attempt exists, but it is deliberately **not** referenced; only the lessons learned carry over. |
| **Existing Codebase** | No |

---

## Current Phase

**Status:** In Progress

| Phase | Status | Last Updated | Notes |
|-------|--------|--------------|-------|
| 0 - Scoping | ✅ Complete | 2026-11-02 | All 7 phases kept — phone use in the garage makes UX + visual design relevant |
| 1 - Concept | ✅ Complete | 2026-11-02 | Risks drafted by AI; pending user tweaks |
| 2 - UX & Discovery | ✅ Complete | 2026-11-02 | Persona + accessibility use defaults | |
| 3 - Product Requirements | ✅ Complete | 2026-11-02 | Acceptance criteria drafted by AI from the discussion | |
| 4 - Architecture | ✅ Complete | 2026-11-02 | Stack DEC-004 + access DEC-003 proposed; data model/API drafted by AI | |
| 5 - Visual Design | ✅ Complete | 2026-11-02 | Dark-first, clean/minimal; bin colors from real Allit bins | |
| 6 - MVP & Roadmap | ✅ Complete | 2026-11-02 | SPV = F1–F8, ship 2026-11-23 (DEC-005) | Sets the Ship Target above |
| 7 - Ship | 🟡 In Progress | 2026-11-02 | M1 code done (locations, stickers, scan detector, camera, Docker). ✅ iPhone camera scanned a real sticker over Tailscale HTTPS (2026-11-02, running on the Mac for now). Remaining for M1: hardware scanner prefix test in a desktop browser; move to the home lab server | Done = SPV live |

**Legend:** ⬜ Not Started | 🟡 In Progress | ✅ Complete | ⏭️ Skipped (N/A for this project)

---

## How Discovery Works

The AI facilitator follows `AGENTS.md` (the canonical instruction file) and asks the questions in `ProcessGuide/starter_questions.md`, phase by phase, populating the framework docs as you answer. For small/solo projects, aim to finish Phases 0–6 in one sitting.

To resume after a break, tell the AI: *"Let's continue where we left off"* — it checks the tracker above and picks up from the first incomplete phase.

---

## Phase Details

### Phase 0: Scoping
**Output:** Project Context (above), Project Summary in `AI-Context.md`
**Focus:** What's being built, new vs. existing code, which phases apply

### Phase 1: Concept
**Output:** `01-Concept.md`
**Focus:** Problem, vision, users, goals, constraints, risks

### Phase 2: UX & Discovery
**Output:** `03-UX-Framework.md`
**Focus:** User journeys, personas, platform selection, accessibility

### Phase 3: Product Requirements
**Output:** `02-PRD.md`
**Focus:** Features, MVP scope, acceptance criteria, priorities

### Phase 4: Architecture
**Output:** `05-System-Architecture.md`, `06-Data-Model.md`, `07-API-Contract.md`
**Focus:** Tech stack, services, data flow, NFRs, API design, test/deploy pipeline

### Phase 5: Visual Design
**Output:** `04-Visual-Style-Guide.md`
**Focus:** Colors, typography, components, design tokens

### Phase 6: MVP & Roadmap
**Output:** `02-PRD.md` (MVP section), `08-Decision-Log.md`, Ship Target (above)
**Focus:** MVP definition, SPV, ship date, milestones, first build steps

### Phase 7: Ship
**Output:** The SPV, live
**Focus:** Unblocking, cutting scope, deploying — see the Phase 7 checklist in `starter_questions.md`

---

## Skipped / Deferred Items

Not every question applies — "skip" and "defer" are valid answers (mechanics in `AGENTS.md`). The AI tracks them here:

| Item | Phase | Status | Reason | Resolved |
|------|-------|--------|--------|----------|
| Evaluate Homebox / InvenTree / PartKeepr (15 min, for ideas) | 1 | Deferred | Not yet looked at | ⬜ |
| Other storage types beyond the main ones | 1 | Deferred | Not needed for now | ⬜ |
| Move backups to the main backup system (off-server) | 4 | Deferred | User's backup system needs fixing first; interim = second drive on the server | ⬜ |
| Confirm Allit case grid size + bin sizes | 5 | Deferred | Resolved from product screenshot: 6 × 4 + front strip; only 1×1/2×1/2×2 | ✅ |
| AI features vs. $0 running cost (local model vs. paid API) | 3 | Deferred | Post-ship feature; decide before building | ⬜ |

**Status:** Skipped (N/A for this project) | Deferred (TBD, will revisit)
**Resolved:** ⬜ Pending | ✅ Done

---

## Revisions

*(AI logs significant changes to previous answers here; major reversals also get a DEC-XXX entry)*

| Date | What Changed | Document | Reason |
|------|--------------|----------|--------|
| 2026-11-02 | Phone scanning = camera only; the hardware scanner is for desktop/Pi (keyboard mode now, USB-COM + Web Serial on the Pi later). No browser on iOS can read serial or Bluetooth | 02-PRD (F1), 05-Architecture, Ship Target | User: "if I use my phone I'd just use the camera". Removes the riskiest M1 check (BT HID on iOS) |

---

## After the SPV Ships

1. Mark the Ship Target status **Shipped** with the actual date, and log it as a DEC-XXX entry
2. The numbered docs (01–07, 10) become advisory/historical — only the Project Summary in `AI-Context.md` and the Decision Log stay current
3. Pull the next work from the Post-Ship Backlog in `02-PRD.md`

---

## Session Notes

*(AI or user can log notes about each session here. Longer transcripts can go in `session-logs/`, which is git-ignored.)*

| Date | Note |
|------|------|
| 2026-11-02 | M1 built: Hono+SQLite API (locations, sticker assign, scan resolve, moves), React app (garage/location/new-location/unassigned screens), Ctrl+B scan interceptor + burst fallback (10 tests), camera scanner (lazy-loaded), Dockerfile/compose, DEPLOY.md. 21 tests pass. Not yet deployed. |
| 2026-11-02 | Kit 1.1.0 copied in. Phase 0 started. Trigger: a big clean-out of the workbench/garage. User answering by voice for a while — keep questions short and easy to answer aloud. |
