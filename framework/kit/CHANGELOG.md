# Changelog

All notable changes to the framework kit. Projects scaffolded from the kit record their kit version in `framework/AI-Context.md`.

## 1.1.0 — 2026-07-13

Incorporates an external review plus an internal audit. Theme: the kit now drives toward *shipping*, not just planning.

### Added
- **Phase 7: Ship** — the discovery flow now ends with a live SPV, not a handoff to "implementation mode"
- **Ship Target block** at the top of `09-Process-Guide.md`: Smallest Publishable Version (SPV), hard ship date, deploy target/domain, status
- **Ship Discipline** rules in `AGENTS.md`: one-line ship status at session open, scope-addition friction (non-blocking additions go to the backlog), overdue behavior (cut scope, don't extend dates), post-ship doc policy
- **Post-Ship Backlog** section in the PRD template
- **Project Summary** table at the top of `AI-Context.md` — the only file that must be read every session (includes one-liner, SPV, ship date, stack, top open decisions, kit version)
- **Task-based reading map** in `AI-Context.md`, replacing the 1st–7th read order
- **Batch mode and defaults** for discovery questions: answer several at once or say "take defaults"; defaultable questions marked `[default: …]` in `starter_questions.md`
- **Falsifiable-metrics rule**: the AI rejects success metrics that can't be counted, observed, or dated
- **Phase 0 exit checklist**: Phase 0 isn't complete until the Project Summary and Project Context tables are populated
- **Phase 0 and Phase 7 rows** in the phase tracker and README phase table
- Test/deploy pipeline question in Phase 4; launch-mechanics questions in Phase 6; fact-check reminder in Phase 1
- **One-liner** field and competitor **Differentiator** column in the Concept template
- **Staleness rule**: docs that contradict code or logged decisions get flagged and fixed, never silently followed
- `LICENSE` (MIT) and this `CHANGELOG.md`

### Changed
- `AGENTS.md` is now the single canonical home for AI behavior rules; `starter_questions.md`, `09-Process-Guide.md`, and `AI-Context.md` link to it instead of restating rules
- "On First Run" now checks for a resumed session **before** asking Phase 0 scoping questions
- Generated UI prompts capped at ~150 lines (summarize from docs, never paste whole documents)
- Timeline questions consolidated: the hard ship date is asked once, in Phase 6
- `examples/task-app/` updated to demonstrate the current process (Phase 0/7 tracker rows, Ship Target, Post-Ship Backlog)

### Fixed
- `AGENTS.md` File Reference table was missing `09-Process-Guide.md` and `10-UI-Generation-Prompt.md`
- Decision Log header used "Decision #003" format instead of the `DEC-XXX` convention it defines
- Example Data Model cited DEC-001 (platform choice) for the Supabase decision; correct reference is DEC-004
- Example README file tree and AI-Context file map omitted `10-UI-Generation-Prompt.md`

## 1.0.0 — baseline

The kit as it existed before versioning: phases 0–6, ten framework documents, tool-config redirects to `AGENTS.md`, TaskFlow worked example.
