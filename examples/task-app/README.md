# Example: TaskFlow

This is a **completed example** of the AI Framework Kit in action. It shows what the framework documents look like after going through the full discovery process.

## About TaskFlow

**TaskFlow** is a task management app for freelancers with built-in time tracking. This example demonstrates:

- A clear problem statement and user personas
- Well-defined MVP scope with prioritized features
- Modern tech stack decisions (Next.js, Supabase, Vercel)
- Complete data model with PostgreSQL schemas
- API contracts using Supabase/PostgREST conventions
- Documented architectural decisions with rationale

## What to Notice

### 1. Documents Are Interconnected

- PRD features reference API endpoints
- Architecture decisions link to the Decision Log (e.g., "see DEC-001")
- UX personas inform feature prioritization
- Data model matches API contract

### 2. Decisions Are Documented

The Decision Log (`08-Decision-Log.md`) captures *why* choices were made, not just *what* was chosen. This is invaluable when revisiting the project later.

### 3. Appropriate Detail Level

- Concept doc is high-level (vision, goals)
- PRD has concrete acceptance criteria
- Data model has actual SQL-ready schemas
- Visual guide has specific tokens and values

### 4. Open Questions Are Tracked

Each doc has an "Open Questions" section. Questions get answered and struck through, or deferred with notes.

### 5. There's a Ship Target

Discovery ends with a concrete Smallest Publishable Version and a hard ship date at the top of `09-Process-Guide.md` (SPV live at taskflow.app by 2025-04-17). Scope additions that don't block the SPV go to the Post-Ship Backlog in the PRD instead of growing the MVP.

## Using This Example

1. **Browse the docs** to understand what "complete" looks like
2. **Copy patterns** you find useful into your own projects
3. **Adapt the depth** — your project might need more or less detail

## File Structure

```
examples/task-app/
├── README.md                    # This file
└── framework/
    ├── AI-Context.md            # Project overview for AI tools
    ├── 01-Concept.md            # Vision, problem, users
    ├── 02-PRD.md                # Features, MVP scope
    ├── 03-UX-Framework.md       # Personas, journeys
    ├── 04-Visual-Style-Guide.md # Design tokens
    ├── 05-System-Architecture.md # Tech stack, infra
    ├── 06-Data-Model.md         # Database schema
    ├── 07-API-Contract.md       # Endpoints, auth
    ├── 08-Decision-Log.md       # Why we chose what
    ├── 09-Process-Guide.md      # Ship target + phase tracker
    └── 10-UI-Generation-Prompt.md # Generated prompt for UI tools
```
