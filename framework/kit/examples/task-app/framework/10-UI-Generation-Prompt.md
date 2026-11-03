# UI Generation Prompt

> **Purpose:** Auto-generated prompt for UI design tools (Google Stitch, v0, Galileo AI, etc.)

---

## Generation Status

✅ Generated on 2025-02-20

---

## Generated Prompt

```
Build a task management web app called "TaskFlow" for freelancers and small teams.

## Core Purpose
A focused task app that helps freelancers see what matters now, track time effortlessly, and ship work without the overhead of enterprise tools. "The task app that gets out of your way."

## Primary User
Alex, a freelance developer (32, works from home, 3-5 active clients). Needs simple daily planning and time tracking for invoicing. Currently frustrated by Notion being too slow and Apple Reminders being too basic.

## Key Jobs to Be Done
- When I start my day, I want to see what I need to work on, so I can focus without deciding
- When I finish a task, I want to log my time, so I can invoice accurately
- When invoicing, I want to see time by project, so I can bill each client correctly

## Main User Flow
Open app → See Today View → Pick a task → Start timer → Work → Stop timer → Mark complete → Repeat

## Screens Needed

1. **Today View (Home)**
   - Task list showing today's tasks and overdue items
   - Quick-add task input at top
   - Floating timer widget (bottom-right)
   - Sidebar with projects list (collapsible on mobile)

2. **Project View**
   - Tasks filtered by selected project
   - Project header with name and color
   - Same task interactions as Today View

3. **Weekly Review**
   - Summary of completed tasks grouped by project
   - Time totals per project
   - Date range selector
   - Export button (CSV)

4. **Task Detail (Modal/Slide-over)**
   - Title, description, due date, project selector
   - Time entries list for this task
   - Delete button

## Visual Style

**Tone:** Minimal, calm, professional — inspired by Things 3 and Linear

**Color Palette:**
- Primary: #3B82F6 (blue)
- Primary Hover: #2563EB
- Background: #FFFFFF
- Surface/Cards: #F3F4F6
- Text Primary: #1F2937
- Text Muted: #6B7280
- Border: #D1D5DB
- Success: #10B981
- Warning: #F59E0B
- Error: #EF4444

**Typography:**
- Font: Inter (headings and body)
- Monospace: JetBrains Mono (for time display)

**Style Notes:**
- Generous whitespace — don't fill every pixel
- Subtle hover states, no bouncy animations
- 8px border radius on cards and inputs
- No shadows — use borders for card definition
- Task items: 48px height, checkbox left, metadata right

**References:** Things 3 (calm aesthetic), Linear (speed, minimal chrome), Vercel Dashboard (clean hierarchy)

## MVP Features
- Task CRUD (create, edit, delete, complete)
- Projects with color coding
- Today View with overdue highlighting
- Start/stop timer on tasks (floating widget)
- Time entries per task
- Weekly review with export

## Key Interactions
- Single click to complete task (checkbox)
- Click play button to start timer (only one active at a time)
- Hover on task row reveals edit/delete/timer icons
- Drag to reorder tasks (optional for MVP)
- Collapsible sidebar on mobile

## Platform
- Web app (responsive)
- Desktop: Full sidebar layout (1024px+)
- Mobile: Collapsed sidebar, bottom nav (<640px)
- PWA-ready

## Accessibility
- Full keyboard navigation
- 4.5:1 color contrast minimum
- Visible focus indicators
- Respect prefers-reduced-motion

---

## What to Generate

Please generate:
- [x] Full app UI with all screens
- [ ] Just the main screen / dashboard
- [ ] Mobile version only
- [ ] Component library

Style: High-fidelity (production-ready look)

Start with the Today View as the primary screen, then show Project View and Weekly Review.
```

---

## Tool-Specific Versions

### For Vercel v0

```
Build a task management app with Next.js and Tailwind CSS.

Features:
- Today view showing tasks due today + overdue
- Projects sidebar (collapsible)
- Start/stop timer on tasks with floating widget
- Weekly review with time summaries

Style: Minimal, calm like Things 3. Use Inter font, blue (#3B82F6) primary color, lots of whitespace. Cards with border, no shadow.

Start with the Today View component.
```

### For Google Stitch

```
Create a freelancer task management app called TaskFlow.

Screens: Today View, Project View, Weekly Review

Design style: Clean and minimal like Linear or Things 3
- Blue primary (#3B82F6)
- White background, light gray cards
- Inter font
- Generous spacing

Key feature: Floating timer widget in bottom-right corner that shows running time and current task.

The Today View should show:
- Task list with checkboxes
- Quick add input at top
- Projects sidebar on left
- Timer widget floating

Make it feel calm and focused, not cluttered.
```

---

## Iteration Log

| Date | Tool | Prompt Summary | Result | Notes |
|------|------|----------------|--------|-------|
| 2025-02-20 | v0 | Full prompt above | Generated 3 screens | Liked the sidebar design |
| 2025-02-20 | v0 | "Make timer widget more prominent" | Updated widget | Added pulse animation when running |
| 2025-02-21 | Stitch | Simplified prompt | Different card style | More rounded, might use for mobile |

---

## Selected Designs

Saved to `assets/ui-concepts/`:
- `today-view-v1.png` — Main Today View layout
- `timer-widget.png` — Floating timer design
- `mobile-view.png` — Mobile responsive version
