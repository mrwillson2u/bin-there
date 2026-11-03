# Data Model

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow uses PostgreSQL via Supabase. The data model is intentionally simple for MVP, with room to extend for teams and collaboration later.

**Core Entities:** Users, Projects, Tasks, Time Entries

---

## Entity Relationship Diagram

```
┌──────────────┐
│    User      │
│   (auth)     │
└──────┬───────┘
       │
       │ 1:N
       ▼
┌──────────────┐       ┌──────────────┐
│   Project    │◀──────│    Task      │
│              │  N:1  │              │
└──────────────┘       └──────┬───────┘
                              │
                              │ 1:N
                              ▼
                       ┌──────────────┐
                       │  TimeEntry   │
                       │              │
                       └──────────────┘
```

---

## Entities

### Entity: User

Managed by Supabase Auth (`auth.users`). We reference it but don't create a separate table.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Supabase auth user ID |
| email | string | unique, not null | User email |
| created_at | timestamp | not null | Account creation |

**Note:** Profile data (name, avatar) can be added via a `profiles` table if needed later.

---

### Entity: Project

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → auth.users, not null | Owner |
| name | varchar(255) | not null | Project name |
| color | varchar(7) | nullable | Hex color (e.g., #3B82F6) |
| archived | boolean | default false | Soft archive |
| created_at | timestamptz | default now() | Creation timestamp |
| updated_at | timestamptz | default now() | Last update |

**Relationships:**
- Belongs to User (user_id)
- Has many Tasks

**Indexes:**
- `idx_projects_user_id` on user_id
- `idx_projects_archived` on (user_id, archived)

**RLS Policies:**
- SELECT: user_id = auth.uid()
- INSERT: user_id = auth.uid()
- UPDATE: user_id = auth.uid()
- DELETE: user_id = auth.uid()

---

### Entity: Task

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → auth.users, not null | Owner |
| project_id | UUID | FK → projects, nullable | Parent project (optional) |
| title | varchar(500) | not null | Task title |
| description | text | nullable | Task details |
| due_date | date | nullable | Due date (no time) |
| completed | boolean | default false | Completion status |
| completed_at | timestamptz | nullable | When completed |
| position | integer | default 0 | Sort order |
| created_at | timestamptz | default now() | Creation timestamp |
| updated_at | timestamptz | default now() | Last update |

**Relationships:**
- Belongs to User (user_id)
- Belongs to Project (project_id, optional)
- Has many TimeEntries

**Indexes:**
- `idx_tasks_user_id` on user_id
- `idx_tasks_project_id` on project_id
- `idx_tasks_due_date` on (user_id, due_date) WHERE completed = false
- `idx_tasks_completed` on (user_id, completed)

**RLS Policies:**
- SELECT: user_id = auth.uid()
- INSERT: user_id = auth.uid()
- UPDATE: user_id = auth.uid()
- DELETE: user_id = auth.uid()

---

### Entity: TimeEntry

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → auth.users, not null | Owner |
| task_id | UUID | FK → tasks, not null | Parent task |
| started_at | timestamptz | not null | Start time |
| ended_at | timestamptz | nullable | End time (null if running) |
| duration_seconds | integer | nullable | Computed duration |
| notes | text | nullable | Optional notes |
| created_at | timestamptz | default now() | Creation timestamp |

**Relationships:**
- Belongs to User (user_id)
- Belongs to Task (task_id)

**Indexes:**
- `idx_time_entries_user_id` on user_id
- `idx_time_entries_task_id` on task_id
- `idx_time_entries_started_at` on (user_id, started_at)

**RLS Policies:**
- SELECT: user_id = auth.uid()
- INSERT: user_id = auth.uid()
- UPDATE: user_id = auth.uid()
- DELETE: user_id = auth.uid()

**Trigger:** On INSERT/UPDATE, compute `duration_seconds` from `ended_at - started_at`.

---

## Relationships Summary

| From | To | Type | Description |
|------|-----|------|-------------|
| User | Project | 1:N | User owns many projects |
| User | Task | 1:N | User owns many tasks |
| Project | Task | 1:N | Project contains many tasks |
| Task | TimeEntry | 1:N | Task has many time entries |

---

## Enums

### TaskStatus (future)

Not needed for MVP (just boolean `completed`). If we add more states:

| Value | Description |
|-------|-------------|
| todo | Not started |
| in_progress | Currently working |
| done | Completed |
| archived | Hidden from view |

---

## Data Lifecycle

### Retention Policies

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| Tasks | Indefinite | User data |
| Time Entries | Indefinite | Needed for historical reports |
| Archived Projects | Indefinite | Can be restored |

### Deletion / GDPR Compliance

- User requests deletion → cascade delete all user data
- Implement "export my data" feature (future)
- Soft-delete preferred over hard delete where possible

---

## Database Choice

| Attribute | Value |
|-----------|-------|
| **Database** | PostgreSQL 15 |
| **Rationale** | Supabase default, strong RLS, relational model fits *(DEC-004)* |
| **Hosting** | Supabase managed |
| **Backup Strategy** | Supabase daily backups (Pro plan) |

---

## Migrations Strategy

- **Tool:** Supabase CLI (`supabase db diff`, `supabase db push`)
- **Naming:** `YYYYMMDD_description.sql`
- **Rollback:** Write down migrations manually
- **Environments:** Dev migrations tested locally before applying to prod

---

## Sample Queries

### Get Today's Tasks

```sql
SELECT * FROM tasks
WHERE user_id = auth.uid()
  AND completed = false
  AND (due_date <= CURRENT_DATE OR due_date IS NULL)
ORDER BY due_date NULLS LAST, position;
```

### Weekly Time Summary by Project

```sql
SELECT 
  p.name as project_name,
  SUM(te.duration_seconds) as total_seconds
FROM time_entries te
JOIN tasks t ON te.task_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE te.user_id = auth.uid()
  AND te.started_at >= date_trunc('week', CURRENT_DATE)
GROUP BY p.id, p.name
ORDER BY total_seconds DESC;
```

---

## Open Questions

- ~~Store computed duration or calculate on read?~~ → Store (trigger updates it)
- Recurring tasks: separate table or metadata on task? → Deferred to post-MVP
