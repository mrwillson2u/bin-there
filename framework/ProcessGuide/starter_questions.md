# Starter Questions for AI-Led Discovery

> **How to use:** An LLM walks through each phase in order, asking these questions conversationally. Answers feed into the corresponding framework docs (see Output Mapping at the end).
>
> **Pacing:** Default one question at a time, but offer each phase as a batch ("answer any or all, or say 'take defaults'"). Questions marked **[default: …]** have a sensible default the AI may propose so the user can accept and move on. Facilitation rules (skipping, deferring, batching, existing codebases) are defined in `AGENTS.md` — this file is just the questions.
>
> Feel free to add, remove, or reorder questions per project.

---

## Phase 0: Project Scoping

**Output → 09-Process-Guide.md (Project Context), AI-Context.md (Project Summary)**

*Ask these first to determine which phases apply:*

1. **What are you building?**
   - Web application
   - Mobile app
   - Backend service / API
   - CLI tool
   - Library / SDK
   - Data pipeline
   - Other: ___

2. **Is this a new project or existing codebase?**
   - New project (starting from scratch)
   - Adding features to existing code
   - Refactoring / redesigning existing system
   - Documenting existing system

3. **If existing codebase:** Where is the code? (path or repo URL)

4. **Does this project have end users with a UI?**
   - Yes → include UX & Visual Design phases
   - No (backend only, internal service, etc.) → skip those phases

5. **Confirm phase selection:**
   Based on your answers, here are the phases we'll cover: [list]
   Does this look right, or should we add/remove any?

*Phase 0 is complete only when the exit checklist in `AGENTS.md` passes: Project Summary in `AI-Context.md` populated, Project Context in `09-Process-Guide.md` populated, skipped phases marked ⏭️.*

---

## Phase 1: Concept

**Output → 01-Concept.md**

1. What is the core problem or opportunity you want to address?
2. Why does this matter now? What's the urgency or catalyst?
3. Who are the primary target users? Secondary users?
4. What does success look like? Name 2-3 measurable outcomes.
   - *Follow-up (required):* For each outcome — how would we know? What would we count, and by when? Convert anything unverifiable into a number, a binary event, or a dated outcome.
5. What are the top 3 risks or unknowns?
6. What constraints exist?
   - Timeline (high-level — the hard ship date is set in Phase 6)
   - Budget
   - Compliance / regulatory **[default: none unless stated]**
   - Technical limitations
7. What exists today that partially solves this? How would this be different?

> ⚠️ Any names, credentials, employers, or credits you state here will be treated as fact by every downstream document — verify them now.

---

## Phase 2: User Experience & Discovery

**Output → 03-UX-Framework.md**

1. Describe the main user journey from start to finish.
2. What are the key user needs, pains, and jobs-to-be-done?
3. Are there distinct user personas? Describe each briefly. **[default: one primary persona for solo/small projects]**
4. Which platforms are in scope? (web, mobile, desktop, embedded, other) **[default: responsive web]**
5. What factors drive the platform choice? (audience behavior, offline needs, device constraints)
6. What accessibility requirements should we plan for? **[default: WCAG 2.1 AA — keyboard navigation, 4.5:1 contrast, visible focus states]**
7. Are there existing workflows or tools users currently rely on?
8. What would make a user choose this over the status quo?

---

## Phase 3: Product Requirements

**Output → 02-PRD.md**

1. List the core features for an MVP. What's the minimum to deliver value?
2. For each feature, what is the acceptance criteria? (How do we know it works?)
3. What features are explicitly out of scope for MVP?
4. How should features be prioritized? (Must-have / Should-have / Nice-to-have)
5. Are there any integration requirements with existing systems? **[default: none for MVP]**

*(Release timeline and the hard ship date are set in Phase 6 — don't ask here.)*

---

## Phase 4: System Architecture

**Output → 05-System-Architecture.md, 06-Data-Model.md, 07-API-Contract.md**

1. What are the core services or components in the system?
2. How do they interact? (sync/async, events, APIs, queues)
3. What data flows between services?
4. What are the key entities and their relationships?
5. What non-functional requirements matter most? **[default for solo MVPs: managed-platform baselines — skip formal SLA/RTO targets]**
   - Scalability
   - Reliability / uptime
   - Security / auth
   - Observability / monitoring
6. Preferred cloud provider or hosting model? Region preferences?
7. What's the proposed tech stack? (language, framework, database, infra)
8. Why this stack over alternatives? (capture reasoning for Decision Log)
9. What are the main API endpoints or interface contracts?
10. How will this be tested and deployed? (CI, environments, deploy pipeline) **[default: platform CI + preview/production environments]**

---

## Phase 5: Visual Design

**Output → 04-Visual-Style-Guide.md**

1. What is the overall visual tone? (minimal, playful, corporate, bold, etc.)
2. Are there existing brand guidelines, colors, or fonts to follow? **[default: starting fresh]**
3. What design system or component library will be used (if any)?
4. What are the target performance metrics? (LCP, CLS, FCP) **[default: LCP < 2.5s, CLS < 0.1, FCP < 1.8s]**
5. Are there reference apps or sites whose design you admire?
6. Dark mode, light mode, or both? **[default: light for MVP, dark post-ship]**

---

## Phase 6: MVP Definition & Roadmap

**Output → 02-PRD.md (MVP section), 08-Decision-Log.md, Ship Target in 09-Process-Guide.md**

1. Summarize the MVP feature set in one sentence.
2. **Define the Smallest Publishable Version (SPV):** the smallest concrete, checkable thing that can go live (e.g., "auth + task CRUD + Today View, live at the domain"). The AI should reject vague definitions.
3. **Commit to a ship date:** a hard calendar date for the SPV.
4. **Launch mechanics:** where does it deploy, at what domain/URL, and how will users reach it?
5. What is the success metric for the MVP launch? (must be checkable — see Phase 1 follow-up)
6. What are the key milestones between now and the ship date?
7. What's the first thing to build? Why?
8. What decisions have been made so far that should be logged?

*Record SPV, ship date, and launch mechanics in the Ship Target block at the top of `09-Process-Guide.md`. From this point on, scope additions follow the Ship Discipline rules in `AGENTS.md`.*

---

## Phase 7: Ship

**Output → the SPV, live. Tracked in 09-Process-Guide.md.**

*This phase has no discovery questions — it's a standing checklist the AI works through with the user until the SPV is live:*

1. What's blocking the SPV right now?
2. Is everything in the SPV definition actually required to publish? What can be cut?
3. Is the deploy pipeline working? (domain resolves, deploys succeed)
4. Ship-day checklist:
   - [ ] SPV definition met, item by item
   - [ ] Live at the target domain/URL
   - [ ] A user who isn't you can reach it
   - [ ] Launch noted in the Decision Log (DEC-XXX) with the actual ship date

*If the ship date passes, the AI proposes cutting SPV scope — not extending the date (see Ship Discipline in `AGENTS.md`).*

---

## Output Mapping

| Phase | Questions Feed Into |
|---|---|
| 0 - Project Scoping | 09-Process-Guide.md (Project Context), AI-Context.md (Project Summary) |
| 1 - Concept | 01-Concept.md |
| 2 - UX & Discovery | 03-UX-Framework.md |
| 3 - Product Requirements | 02-PRD.md |
| 4 - Architecture | 05-System-Architecture.md, 06-Data-Model.md, 07-API-Contract.md |
| 5 - Visual Design | 04-Visual-Style-Guide.md |
| 6 - MVP & Roadmap | 02-PRD.md (MVP section), 08-Decision-Log.md, 09-Process-Guide.md (Ship Target) |
| 7 - Ship | Live SPV; status in 09-Process-Guide.md |

---

## Facilitation Rules

Batching, defaults, skipping, deferring, resuming, revising, existing-codebase handling, and ship discipline are all defined once in **`AGENTS.md`** — follow that file rather than restating rules here.
