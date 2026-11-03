# Concept Document

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Problem Statement

Freelancers and small teams struggle to manage tasks across multiple projects. Existing tools are either too complex (Jira, Asana) or too simple (Apple Reminders, sticky notes). They need something in between — powerful enough to handle real work, but simple enough to not get in the way.

The pain points:
- Context switching between projects is mentally exhausting
- No clear view of "what should I work on right now?"
- Task dependencies and blockers aren't visible
- Time tracking is an afterthought, making invoicing painful

## Vision

A focused task management app that helps freelancers and small teams see what matters now, track their time effortlessly, and ship work without the overhead of enterprise tools.

**One-liner:** "The task app that gets out of your way."

---

## Target Users

| User Segment | Description | Key Need |
|--------------|-------------|----------|
| Solo Freelancers | Designers, developers, consultants working alone | Simple daily planning, time tracking for invoicing |
| Small Teams (2-5) | Agencies, startups, small studios | Shared visibility, lightweight collaboration |
| Side Project Builders | People with day jobs building something on the side | Weekend-friendly, no guilt for gaps |

**Primary:** Solo Freelancers
**Secondary:** Small Teams

---

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| User adoption | Weekly active users | 1,000 WAU in 6 months |
| Engagement | Tasks completed per user per week | 15+ |
| Retention | 30-day retention | 40% |
| Revenue (stretch) | Paid conversions | 5% of WAU |

---

## Constraints

- **Timeline:** MVP in 8 weeks
- **Budget:** Solo developer, minimal infra costs (<$50/mo)
- **Compliance:** None for MVP (no healthcare, finance, etc.)
- **Technical:** Must work offline for basic task management

---

## Risks & Unknowns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Crowded market — hard to differentiate | High | High | Focus on specific niche (freelancers), nail the UX |
| Offline sync complexity | Medium | Medium | Use proven sync library (e.g., PowerSync, Replicache) |
| Scope creep — too many features | High | Medium | Strict MVP definition, say no often |
| Solo dev burnout | Medium | High | Time-box work, ship iteratively |

---

## Competitive Landscape

| Competitor | Strengths | Weaknesses | Our Differentiator |
|------------|-----------|------------|-------------------|
| Todoist | Polished, cross-platform | No time tracking, weak project views | Built-in time tracking |
| Linear | Beautiful, fast | Team-focused, overkill for freelancers | Simpler, solo-friendly |
| Notion | Flexible | Too flexible — setup overhead | Opinionated, works out of box |
| Apple Reminders | Free, native | Too basic, no projects | Project structure, time tracking |

---

## Open Questions

- ~~What's the monetization model?~~ → Freemium with paid tier for teams
- ~~Mobile app or PWA?~~ → PWA first, native later if traction
- How to handle recurring tasks elegantly?
