# Process Guide

> **Purpose:** Ship target, phase tracker, and current project state.

---

## Ship Target

| Attribute | Value |
|-----------|-------|
| **Smallest Publishable Version (SPV)** | Email/password auth + task CRUD + projects + Today View + start/stop timer, live at taskflow.app. (Offline support and Weekly Review are should-haves — not required to publish.) |
| **Ship Date** | 2025-04-17 (8 weeks from end of discovery) |
| **Deploy Target / Domain** | Vercel production, taskflow.app (preview deploys per PR) |
| **Status** | On track — implementation in progress |

Scope additions that don't block the SPV go to the Post-Ship Backlog in `02-PRD.md` (see Ship Discipline in `AGENTS.md`).

---

## Project Context

| Attribute | Value |
|-----------|-------|
| **Project Type** | Web application (SaaS, PWA) |
| **Scope** | New project |
| **Existing Codebase** | No |

---

## Current Phase

**Status:** 🟡 Phase 7: Ship — building the SPV

| Phase | Status | Last Updated | Notes |
|-------|--------|--------------|-------|
| 0 - Scoping | ✅ Complete | 2025-02-18 | Full-stack web app — all phases apply |
| 1 - Concept | ✅ Complete | 2025-02-18 | |
| 2 - UX & Discovery | ✅ Complete | 2025-02-19 | |
| 3 - Product Requirements | ✅ Complete | 2025-02-19 | |
| 4 - Architecture | ✅ Complete | 2025-02-20 | |
| 5 - Visual Design | ✅ Complete | 2025-02-20 | |
| 6 - MVP & Roadmap | ✅ Complete | 2025-02-20 | Ship Target set (above) |
| 7 - Ship | 🟡 In Progress | 2025-02-20 | SPV due 2025-04-17 |

**Legend:** ⬜ Not Started | 🟡 In Progress | ✅ Complete | ⏭️ Skipped

---

## Next Steps (Path to SPV)

1. **Set up repository** — Next.js + Supabase starter
2. **Configure Supabase** — Create project, run migrations
3. **Build auth flow** — Sign up, login, password reset
4. **Implement Task CRUD** — Core functionality
5. **Add Projects** — Grouping and filtering
6. **Build Today View** — Focused daily view
7. **Add Time Tracking** — Timer and entries
8. **Deploy to taskflow.app** — SPV live ✅ ship

*Post-SPV (before or after ship date, whichever scope allows): offline support, Weekly Review, polish.*

---

## Skipped / Deferred Items

| Item | Phase | Status | Reason | Resolved |
|------|-------|--------|--------|----------|
| Time-entry granularity (nearest minute vs. 15 min) | 3 | Deferred | Decide during timer implementation | ⬜ |
| Recurring tasks approach | 4 | Deferred | Post-MVP feature — see Post-Ship Backlog | ⬜ |

---

## Session Notes

| Date | Note |
|------|------|
| 2025-02-18 | Started discovery. Completed Scoping, Concept, and initial Architecture decisions. |
| 2025-02-19 | Fleshed out UX personas and PRD features. Decided on floating timer. |
| 2025-02-20 | Finalized all docs. Set Ship Target: SPV live at taskflow.app by 2025-04-17. |
