# UX Framework

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow targets freelancers who are overwhelmed by complex tools but need more than a simple checklist. The UX prioritizes speed, clarity, and minimal friction. Every interaction should feel instant and obvious.

**Design Principles:**
1. **Speed over features** — Common actions in 1-2 clicks max
2. **Focus over flexibility** — Opinionated defaults, limited customization
3. **Calm over busy** — Lots of whitespace, muted colors, no visual noise

---

## User Personas

### Persona 1: Alex the Freelance Developer

| Attribute | Description |
|-----------|-------------|
| **Role/Title** | Full-stack developer, freelance |
| **Demographics** | 32, works from home, 3-5 active clients |
| **Goals** | Ship client work on time, track hours accurately, avoid admin overhead |
| **Pain Points** | Loses track of tasks across clients, forgets to log time, invoicing is painful |
| **Current Tools** | Notion (too slow), Apple Reminders (too basic), spreadsheet for time |
| **Tech Comfort** | High — wants keyboard shortcuts, fast UI |

### Persona 2: Maya the Designer

| Attribute | Description |
|-----------|-------------|
| **Role/Title** | Brand/UI designer, small agency (3 people) |
| **Demographics** | 28, works in studio, 6-8 active projects |
| **Goals** | Know what to work on each day, share status with team, bill hourly |
| **Pain Points** | Too many tools, context switching, no single source of truth |
| **Current Tools** | Asana (too complex), Toggl (separate from tasks), Slack |
| **Tech Comfort** | Medium — appreciates good design, not into power-user features |

---

## User Journey Map

### Primary Flow: Daily Task Workflow

```
Open App → See Today View → Pick a task → Start timer → Work → Stop timer → Mark complete → Repeat
```

| Stage | User Action | System Response | Pain Points | Opportunities |
|-------|-------------|-----------------|-------------|---------------|
| Open app | Navigate to TaskFlow | Load Today View (instant) | Slow load kills momentum | Aggressive caching, PWA |
| Pick task | Scan today's tasks | Highlight overdue, sort by priority | Too many tasks = overwhelm | Smart defaults, limit view |
| Start timer | Click play button | Timer starts, task highlighted | Forgetting to start | Auto-prompt? Keyboard shortcut |
| Work | External (not in app) | Timer running in tab/widget | Lose track of active timer | Persistent floating timer |
| Stop timer | Click stop | Time entry created | Forget to stop | Idle detection prompt |
| Complete | Click checkbox | Task moves to Done | Want to celebrate | Subtle animation, streak? |

---

## Jobs to Be Done

| Job Statement | Priority | Current Solution |
|---------------|----------|------------------|
| When I start my day, I want to see what I need to work on, so I can focus without deciding. | High | Check multiple apps, make mental list |
| When I finish a task, I want to log my time, so I can invoice accurately. | High | Manual entry in spreadsheet/Toggl |
| When invoicing, I want to see time by project, so I can bill each client correctly. | High | Export from separate tool, reconcile |
| When I have a new task, I want to capture it instantly, so I don't forget. | Medium | Note on phone, sticky note |

---

## Platform Selection

### Chosen Platform(s)

**Web app (responsive)** — PWA for offline support and "install" capability.

### Decision Factors

| Factor | Weight | Notes |
|--------|--------|-------|
| User behavior / preferences | High | Freelancers work on laptops primarily |
| Offline requirements | Medium | Needed for basic use, not real-time sync |
| Device constraints | Low | Modern browsers only |
| Development cost | High | Solo dev — web is fastest path to MVP |
| Time to market | High | 8 weeks — no time for native apps |

*(see DEC-001 in Decision Log)*

---

## Accessibility Requirements

| Requirement | Standard | Priority |
|-------------|----------|----------|
| Keyboard navigation | Full app usable without mouse | High |
| Screen reader support | WCAG 2.1 AA | Medium |
| Color contrast | 4.5:1 minimum | High |
| Focus indicators | Visible focus states | High |
| Reduced motion | Respect prefers-reduced-motion | Medium |

---

## Existing Workflows

| Tool/Process | Purpose | Pain Points | Integration Opportunity |
|--------------|---------|-------------|------------------------|
| Notion | Project notes, docs | Slow, tasks buried | Link to external docs |
| Google Calendar | Meetings, deadlines | Tasks separate from calendar | Future: sync due dates |
| Spreadsheet | Time tracking | Manual, error-prone | Replace with built-in |
| Email | Client communication | Tasks get lost in threads | Future: email-to-task |

---

## Competitive UX Analysis

| Competitor | Strengths | Weaknesses | Lessons |
|------------|-----------|------------|---------|
| Linear | Blazing fast, keyboard-first | Dense UI, learning curve | Speed matters, shortcuts help |
| Todoist | Clean, intuitive | Feels basic, no time tracking | Simple isn't always enough |
| Things 3 | Beautiful, calm | Apple-only, no web | Calm aesthetic works |
| Toggl Track | Best-in-class timer | Tasks separate | Integrate timer with tasks |

---

## Open Questions

- ~~Mobile: responsive web or native?~~ → Responsive web + PWA (see DEC-001)
- How prominent should the timer be? (Always visible vs. on-demand)
