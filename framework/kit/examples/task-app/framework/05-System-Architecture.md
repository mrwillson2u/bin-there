# System Architecture

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow is a modern web application built with Next.js and Supabase, deployed on Vercel. The architecture prioritizes simplicity, speed, and low operational overhead for a solo developer.

**Architecture Style:** Monolithic web app with serverless backend (Supabase handles auth, database, and realtime).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Next.js App (React)                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐│   │
│  │  │ Today   │  │ Projects│  │ Timer   │  │ Weekly      ││   │
│  │  │ View    │  │ View    │  │ Widget  │  │ Review      ││   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                    ┌─────────▼─────────┐                       │
│                    │   Service Worker   │ (Offline/PWA)        │
│                    └───────────────────┘                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Auth     │  │  PostgreSQL │  │    Realtime (future)    │ │
│  │  (GoTrue)   │  │   Database  │  │    Subscriptions        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │   Storage   │  │    Edge     │                              │
│  │  (future)   │  │  Functions  │                              │
│  └─────────────┘  └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel                                  │
│           (Hosting, CDN, Edge, Preview Deployments)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend | Next.js (App Router) | 14.x | React framework, SSR, great DX *(DEC-001)* |
| UI Library | React | 18.x | Industry standard |
| Styling | Tailwind CSS | 3.x | Utility-first, fast iteration |
| State | Zustand | 4.x | Simple, minimal boilerplate *(DEC-002)* |
| Database | PostgreSQL (Supabase) | 15.x | Relational, Row Level Security |
| Auth | Supabase Auth | — | Built-in, handles OAuth, magic links |
| Backend | Supabase (BaaS) | — | All-in-one: DB, auth, storage *(DEC-004)* |
| Hosting | Vercel | — | Zero-config Next.js deployment |
| Offline | Service Worker + IndexedDB | — | PWA with background sync |
| Analytics | Plausible | — | Privacy-friendly, simple |

---

## Services / Components

### Component: Next.js App

| Attribute | Value |
|-----------|-------|
| **Responsibility** | UI rendering, routing, client-side logic |
| **Technology** | Next.js 14 (App Router) |
| **Exposes** | Web pages at taskflow.app |
| **Consumes** | Supabase API (REST + Realtime) |
| **Data Owned** | None (stateless, except localStorage/IndexedDB for offline) |
| **Scaling Strategy** | Vercel auto-scales |

### Component: Supabase Backend

| Attribute | Value |
|-----------|-------|
| **Responsibility** | Data persistence, auth, API |
| **Technology** | PostgreSQL + PostgREST + GoTrue |
| **Exposes** | REST API, Realtime subscriptions |
| **Consumes** | N/A |
| **Data Owned** | All user data (tasks, projects, time entries) |
| **Scaling Strategy** | Supabase managed (can upgrade tier) |

---

## Data Flow

### Primary Flow: Create Task

```
User → Next.js UI → Supabase Client → PostgREST API → PostgreSQL
                                              │
                                              ▼
                                    Row Level Security
                                    (validates user owns data)
```

| Step | From | To | Data | Protocol |
|------|------|-----|------|----------|
| 1 | User | Next.js | Form input | User action |
| 2 | Next.js | Supabase | Task payload + JWT | HTTPS (REST) |
| 3 | Supabase | PostgreSQL | INSERT query | Internal |
| 4 | PostgreSQL | Supabase | New task row | Internal |
| 5 | Supabase | Next.js | Task object | HTTPS (JSON) |
| 6 | Next.js | User | UI update | React state |

---

## Communication Patterns

| Pattern | Where Used | Notes |
|---------|------------|-------|
| REST API | All CRUD operations | Supabase auto-generates from schema |
| Realtime (WebSocket) | Future: team collaboration | Supabase Realtime for live updates |
| Service Worker | Offline support | Background sync when online |

---

## Non-Functional Requirements

### Scalability

| Metric | Current Target | Future Target |
|--------|---------------|---------------|
| Concurrent users | 100 | 10,000 |
| Requests/sec | 10 | 1,000 |
| Data volume | < 1 GB | < 100 GB |

MVP is designed for small scale. Supabase can scale up as needed.

### Reliability

| Metric | Target |
|--------|--------|
| Uptime SLA | 99.5% (Supabase + Vercel baseline) |
| RTO | < 1 hour (Supabase backups) |
| RPO | < 1 hour |

### Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | Supabase Auth (email/password, OAuth future) |
| Authorization | PostgreSQL Row Level Security (RLS) |
| Data encryption (at rest) | Supabase managed (encrypted) |
| Data encryption (in transit) | HTTPS everywhere |
| Secrets management | Vercel environment variables |
| Audit logging | Future: Supabase audit logs |

### Observability

| Type | Tool | Notes |
|------|------|-------|
| Logging | Vercel Logs | Built-in, basic |
| Metrics | Plausible | Page views, events |
| Error tracking | Sentry | Future (not MVP) |
| Alerting | Email (Vercel) | Deploy failures |

---

## Infrastructure

### Hosting

| Environment | Provider | Region | Notes |
|-------------|----------|--------|-------|
| Development | Local | — | `next dev` + Supabase local |
| Preview | Vercel | auto | Per-PR deploys |
| Production | Vercel | sfo1 | Primary region |

### Supabase Project

| Environment | Project |
|-------------|---------|
| Development | taskflow-dev |
| Production | taskflow-prod |

---

## Third-Party Dependencies

| Service | Purpose | Criticality | Fallback |
|---------|---------|-------------|----------|
| Supabase | Database, Auth | Critical | None (core dependency) |
| Vercel | Hosting, CDN | Critical | Netlify (compatible) |
| Plausible | Analytics | Low | Remove analytics |

---

## Open Questions

- ~~Offline strategy: Service Worker vs. dedicated library?~~ → Service Worker + basic IndexedDB (simple, sufficient)
- Do we need Edge Functions for anything? → Not for MVP
