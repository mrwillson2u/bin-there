# Product Requirements Document

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow is a focused task management web app for freelancers and small teams. It combines simple task management with built-in time tracking to help users stay on top of work and bill accurately.

---

## MVP Scope

### In Scope

| Feature | Description | Priority | Acceptance Criteria |
|---------|-------------|----------|---------------------|
| Task CRUD | Create, edit, delete, complete tasks | Must-have | User can manage tasks with title, description, due date |
| Projects | Group tasks into projects | Must-have | User can create projects, assign tasks to projects |
| Today View | See tasks due today + overdue | Must-have | Single view shows today's work clearly |
| Time Tracking | Start/stop timer on tasks | Must-have | Timer persists across page refresh, logs time entries |
| Basic Auth | Email/password signup and login | Must-have | Secure auth, password reset flow |
| Offline Support | View and edit tasks offline | Should-have | Changes sync when back online |
| Weekly Review | Summary of completed work + time | Should-have | Exportable for invoicing |

### Out of Scope (for MVP)

- Team collaboration (invites, shared projects)
- Native mobile apps
- Integrations (calendar, Slack, etc.)
- Recurring tasks
- Subtasks / checklists
- File attachments
- Comments on tasks

---

## Post-Ship Backlog

Scope additions that don't block the SPV land here (see Ship Discipline in `AGENTS.md`):

| Feature / Idea | Added | Why It Can Wait |
|----------------|-------|-----------------|
| Recurring tasks | 2025-02-20 | Core loop works without them; design question still open |
| Google Calendar sync | 2025-02-20 | Integration, not core value; revisit after retention data |
| Dark mode | 2025-02-20 | Planned v1.1 (see Visual Style Guide) |

---

## Feature Details

### Feature 1: Task Management

**Description:** Core task CRUD with essential fields.

**User Story:** As a freelancer, I want to quickly capture tasks so I don't forget what I need to do.

**Acceptance Criteria:**
- [x] Create task with title (required), description (optional), due date (optional), project (optional)
- [x] Edit any task field inline
- [x] Mark task complete with single click/tap
- [x] Delete task with confirmation
- [x] Completed tasks move to "Done" section, can be viewed/restored

**Dependencies:** Auth (tasks belong to user)

---

### Feature 2: Projects

**Description:** Organize tasks into projects for better structure.

**User Story:** As a freelancer with multiple clients, I want to group tasks by project so I can focus on one client at a time.

**Acceptance Criteria:**
- [x] Create project with name and optional color
- [x] Assign tasks to a project (or leave unassigned)
- [x] Filter task list by project
- [x] Archive completed projects
- [x] Delete project (tasks become unassigned, not deleted)

**Dependencies:** Task Management

---

### Feature 3: Today View

**Description:** A focused view showing only what matters today.

**User Story:** As a user, I want to see my tasks for today so I know what to work on without distractions.

**Acceptance Criteria:**
- [x] Shows tasks due today
- [x] Shows overdue tasks (highlighted)
- [x] Can add tasks directly to Today
- [x] Tasks auto-remove from Today when completed
- [x] Clean, minimal design — no clutter

**Dependencies:** Task Management

---

### Feature 4: Time Tracking

**Description:** Simple start/stop timer attached to tasks.

**User Story:** As a freelancer, I want to track time spent on tasks so I can invoice clients accurately.

**Acceptance Criteria:**
- [x] Start timer on any task (one active timer at a time)
- [x] Timer visible in header/floating UI
- [x] Stop timer → creates time entry with duration
- [x] View time entries per task
- [x] Manual time entry (add time without timer)
- [x] Timer state persists across browser refresh

**Dependencies:** Task Management

---

### Feature 5: Weekly Review

**Description:** Summary view of completed work and time logged.

**User Story:** As a freelancer, I want to see what I accomplished this week so I can invoice clients and feel good about my progress.

**Acceptance Criteria:**
- [x] Shows completed tasks grouped by project
- [x] Shows total time per project
- [x] Date range selector (this week, last week, custom)
- [x] Export as CSV or simple text
- [x] Accessible from main nav

**Dependencies:** Task Management, Time Tracking

---

## Success Metrics

| Metric | Definition | Target | Measurement Method |
|--------|------------|--------|-------------------|
| Activation | User creates first project + 3 tasks | 60% of signups | Analytics event |
| Engagement | Tasks completed per WAU | 15+ | Weekly aggregate |
| Retention | Return within 7 days | 50% | Cohort analysis |
| Time Tracking Adoption | % of tasks with time logged | 30% | DB query |

---

## Timeline & Milestones

| Milestone | Target Date | Description |
|-----------|-------------|-------------|
| Auth + Task CRUD | Week 2 | Core functionality working |
| Projects + Today View | Week 4 | Organization and focus |
| Time Tracking | Week 6 | Timer and time entries |
| Offline + Weekly Review | Week 7 | Polish features |
| SPV Ships (MVP Launch) | Week 8 — 2025-04-17 | Public beta, live at taskflow.app (matches Ship Target in 09-Process-Guide.md) |

---

## Integration Requirements

| System | Integration Type | Purpose | Priority |
|--------|-----------------|---------|----------|
| None for MVP | — | — | — |

*Future: Google Calendar, Slack, Zapier*

---

## Open Questions

- ~~Timer UX: floating widget or inline?~~ → Floating widget (see DEC-003)
- How granular should time entries be? (nearest minute? 15 min?)

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-02-20 | Colin | Initial draft from discovery |
