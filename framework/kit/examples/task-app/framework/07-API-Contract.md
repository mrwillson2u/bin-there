# API Contract

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow uses Supabase's auto-generated REST API (PostgREST). This document describes the API contract from the client's perspective.

**API Style:** REST (PostgREST conventions)

**Base URL:** `https://<project>.supabase.co/rest/v1`

---

## Authentication

| Method | Description |
|--------|-------------|
| Bearer Token | Supabase JWT (access_token from auth) |

All requests require the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Plus the Supabase anon key:

```
apikey: <supabase_anon_key>
```

### Auth Flow

```
1. User signs up/in via Supabase Auth
2. Client receives access_token + refresh_token
3. Client includes access_token in all API requests
4. Row Level Security enforces user can only access their data
```

---

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer <access_token> |
| apikey | Yes | Supabase anon key |
| Content-Type | Yes (POST/PATCH) | application/json |
| Prefer | No | return=representation (to get created/updated row) |

---

## Error Handling

### Error Response Format (PostgREST)

```json
{
  "code": "PGRST301",
  "details": null,
  "hint": null,
  "message": "JWT expired"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| PGRST301 | 401 | JWT expired or invalid |
| PGRST204 | 404 | No rows returned |
| 23505 | 409 | Unique constraint violation |
| 42501 | 403 | RLS policy violation |
| 23503 | 400 | Foreign key violation |

---

## Rate Limiting

Supabase free tier:
- 500 requests per day (Auth)
- No hard limit on database requests (but connection pooling limits apply)

Pro tier removes these limits.

---

## Endpoints

### Resource: Projects

#### GET /projects

**Description:** List all projects for current user

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| archived | eq.true/eq.false | No | Filter by archived status |
| order | string | No | Sort field (e.g., `created_at.desc`) |
| select | string | No | Fields to return |

**Example:**

```bash
GET /projects?archived=eq.false&order=created_at.desc
```

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "Client A Website",
    "color": "#3B82F6",
    "archived": false,
    "created_at": "2025-02-20T10:00:00Z",
    "updated_at": "2025-02-20T10:00:00Z"
  }
]
```

---

#### POST /projects

**Description:** Create a new project

**Request Body:**

```json
{
  "name": "New Project",
  "color": "#10B981"
}
```

**Headers:**

```
Prefer: return=representation
```

**Response:** `201 Created`

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "New Project",
    "color": "#10B981",
    "archived": false,
    "created_at": "2025-02-20T10:00:00Z",
    "updated_at": "2025-02-20T10:00:00Z"
  }
]
```

---

#### PATCH /projects?id=eq.<uuid>

**Description:** Update a project

**Request Body:**

```json
{
  "name": "Renamed Project"
}
```

**Response:** `200 OK` (with `Prefer: return=representation`)

---

#### DELETE /projects?id=eq.<uuid>

**Description:** Delete a project

**Response:** `204 No Content`

**Note:** Tasks in this project will have `project_id` set to null (not deleted).

---

### Resource: Tasks

#### GET /tasks

**Description:** List tasks for current user

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| project_id | eq.<uuid> | Filter by project |
| completed | eq.true/eq.false | Filter by status |
| due_date | lte.<date> | Due on or before date |
| order | string | Sort (e.g., `position.asc,created_at.desc`) |
| select | string | Fields (can include relations) |

**Example — Today's Tasks:**

```bash
GET /tasks?completed=eq.false&due_date=lte.2025-02-20&order=due_date.asc,position.asc
```

**Example — With Project Data:**

```bash
GET /tasks?select=*,project:projects(id,name,color)
```

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "title": "Design homepage",
    "description": "Create wireframes",
    "due_date": "2025-02-20",
    "completed": false,
    "completed_at": null,
    "position": 1,
    "project": {
      "id": "uuid",
      "name": "Client A Website",
      "color": "#3B82F6"
    },
    "created_at": "2025-02-19T10:00:00Z",
    "updated_at": "2025-02-19T10:00:00Z"
  }
]
```

---

#### POST /tasks

**Description:** Create a new task

**Request Body:**

```json
{
  "title": "New task",
  "description": "Optional details",
  "due_date": "2025-02-21",
  "project_id": "uuid-or-null"
}
```

**Response:** `201 Created`

---

#### PATCH /tasks?id=eq.<uuid>

**Description:** Update a task

**Request Body (partial):**

```json
{
  "completed": true,
  "completed_at": "2025-02-20T15:30:00Z"
}
```

**Response:** `200 OK`

---

#### DELETE /tasks?id=eq.<uuid>

**Description:** Delete a task

**Response:** `204 No Content`

**Note:** Associated time entries are cascade deleted.

---

### Resource: Time Entries

#### GET /time_entries

**Description:** List time entries

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| task_id | eq.<uuid> | Filter by task |
| started_at | gte.<timestamp> | Started after |
| started_at | lte.<timestamp> | Started before |
| ended_at | is.null | Get running timer |
| select | string | Fields + relations |

**Example — Running Timer:**

```bash
GET /time_entries?ended_at=is.null&select=*,task:tasks(id,title)
```

**Example — This Week:**

```bash
GET /time_entries?started_at=gte.2025-02-17T00:00:00Z&order=started_at.desc
```

---

#### POST /time_entries

**Description:** Start a timer (create entry with no end time)

**Request Body:**

```json
{
  "task_id": "uuid",
  "started_at": "2025-02-20T10:00:00Z"
}
```

**Response:** `201 Created`

---

#### PATCH /time_entries?id=eq.<uuid>

**Description:** Stop timer (set end time)

**Request Body:**

```json
{
  "ended_at": "2025-02-20T11:30:00Z"
}
```

**Note:** Trigger will compute `duration_seconds` automatically.

---

#### DELETE /time_entries?id=eq.<uuid>

**Description:** Delete a time entry

**Response:** `204 No Content`

---

## RPC Functions (Future)

For complex operations, we can add PostgreSQL functions callable via `/rpc/function_name`.

**Potential RPCs:**
- `weekly_summary(start_date, end_date)` — Aggregated time by project
- `reorder_tasks(task_ids[])` — Batch position update

---

## Realtime Subscriptions (Future)

Supabase Realtime can push changes via WebSocket:

```javascript
supabase
  .channel('tasks')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handleChange)
  .subscribe()
```

Not needed for MVP (single user), but ready for team collaboration.

---

## Client Library

Using `@supabase/supabase-js`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// List tasks
const { data, error } = await supabase
  .from('tasks')
  .select('*, project:projects(id, name, color)')
  .eq('completed', false)
  .order('position')

// Create task
const { data, error } = await supabase
  .from('tasks')
  .insert({ title: 'New task', project_id: projectId })
  .select()
  .single()
```

---

## Open Questions

- ~~Do we need custom RPC functions?~~ → Not for MVP
- Batch operations? → Use PostgREST bulk inserts/updates
