# Decision Log

> **Purpose:** Record significant architectural, design, and product decisions with context and rationale.
> Reference entries from other docs using the decision ID (e.g., "see DEC-001").

---

## Decisions

### DEC-001: Web App with PWA (No Native Apps)

| Attribute | Value |
|-----------|-------|
| **Date** | 2025-02-18 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Architecture / Platform |

**Context:**

Need to decide target platform for MVP. Options are native mobile apps, cross-platform (React Native/Flutter), or web with PWA.

Constraints: Solo developer, 8-week timeline, need offline support.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Native iOS + Android | Best UX, full device access | 2x codebase, long timeline, App Store review |
| React Native | Single codebase, native feel | Still complex, tooling overhead, two deploy targets |
| Web + PWA | Single codebase, instant deploy, works everywhere | Less "native" feel, limited device APIs |

**Decision:**

Web application with PWA for offline support.

**Rationale:**

1. Solo dev can ship faster with one codebase
2. Primary users (freelancers) work on laptops — web is fine
3. PWA gives "good enough" mobile experience
4. No App Store gatekeeping
5. Can always add native later if needed

**Consequences:**

- Limited to web APIs (no push notifications on iOS Safari until recently)
- Need to build offline support carefully with Service Worker
- Mobile UX won't be as polished as native

**Related:**
- Referenced in: `03-UX-Framework.md`, `05-System-Architecture.md`

---

### DEC-002: Zustand for State Management

| Attribute | Value |
|-----------|-------|
| **Date** | 2025-02-18 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Tech Stack |

**Context:**

Need client-side state management for task data, timer state, and UI state. React's built-in state is insufficient for cross-component sharing.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| React Context + useReducer | Built-in, no deps | Verbose, prop drilling, re-render issues |
| Redux Toolkit | Mature, devtools, middleware | Boilerplate, overkill for MVP |
| Zustand | Simple API, minimal boilerplate, fast | Smaller ecosystem |
| Jotai | Atomic, fine-grained | Different mental model, newer |

**Decision:**

Zustand for state management.

**Rationale:**

1. Minimal boilerplate — create store in 10 lines
2. Works outside React components (useful for timer logic)
3. Good TypeScript support
4. Easy to understand for solo dev
5. Can migrate to Redux later if needed (similar patterns)

**Consequences:**

- Less middleware ecosystem than Redux
- Team members (if ever) need to learn Zustand
- Simple is fine for MVP scope

**Related:**
- Referenced in: `05-System-Architecture.md`

---

### DEC-003: Floating Timer Widget

| Attribute | Value |
|-----------|-------|
| **Date** | 2025-02-19 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:**

Timer needs to be visible while user works on tasks. Options are inline (expand task row), fixed header bar, or floating widget.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Inline (expand task) | Context clear | Scrolls out of view, clutters list |
| Header bar | Always visible, simple | Takes vertical space, feels heavy |
| Floating widget | Always visible, minimal, moveable | Overlays content, more complex |

**Decision:**

Floating widget (bottom-right corner, collapsible).

**Rationale:**

1. Persistent visibility without taking layout space
2. Can be collapsed to just show time
3. Follows Toggl's proven pattern
4. Works on mobile (can move to avoid thumb zone)

**Consequences:**

- Need to handle z-index carefully
- Accessibility: ensure keyboard navigable
- Mobile: test positioning on small screens

**Related:**
- Referenced in: `02-PRD.md`, `03-UX-Framework.md`

---

### DEC-004: Supabase as Backend

| Attribute | Value |
|-----------|-------|
| **Date** | 2025-02-18 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Tech Stack |

**Context:**

Need backend for auth, database, and eventually real-time. Options are build custom (Node/Express + DB), use Firebase, or use Supabase.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Custom (Node + PostgreSQL) | Full control | More work, deploy complexity |
| Firebase | Fast setup, good auth | NoSQL (Firestore), vendor lock-in, pricing |
| Supabase | PostgreSQL, RLS, auth, open-source | Younger product, smaller community |

**Decision:**

Supabase as backend-as-a-service.

**Rationale:**

1. PostgreSQL — proper relational DB with RLS
2. Built-in auth with email/password and OAuth
3. Auto-generated REST API from schema
4. Open-source — can self-host if needed
5. Free tier is generous for MVP
6. Realtime built-in for future team features

**Consequences:**

- Dependent on Supabase's reliability
- Learning RLS patterns
- Migration path if we outgrow: self-host or move to custom

**Related:**
- Referenced in: `05-System-Architecture.md`, `06-Data-Model.md`

---

## Decision Index

| ID | Title | Category | Status | Date |
|----|-------|----------|--------|------|
| DEC-001 | Web App with PWA | Architecture | Accepted | 2025-02-18 |
| DEC-002 | Zustand for State | Tech Stack | Accepted | 2025-02-18 |
| DEC-003 | Floating Timer Widget | UX | Accepted | 2025-02-19 |
| DEC-004 | Supabase as Backend | Tech Stack | Accepted | 2025-02-18 |
