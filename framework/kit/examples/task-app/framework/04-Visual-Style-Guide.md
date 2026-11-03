# Visual Style Guide

> **Status:** Complete
> **Last Updated:** 2025-02-20
> **Owner:** Colin

---

## Overview

TaskFlow's visual design is **calm, minimal, and fast-feeling**. We avoid visual clutter to let users focus on their work. The aesthetic is inspired by Things 3 and Linear — clean lines, generous whitespace, subtle interactions.

**Visual Tone:** Minimal, calm, professional

**Design Principles:**
1. **Less is more** — Every element earns its place
2. **Whitespace is a feature** — Don't fill every pixel
3. **Subtle over flashy** — Micro-interactions, not animations
4. **Consistent rhythm** — Spacing and sizing follow a strict scale

---

## Brand Guidelines

### Logo

TaskFlow wordmark in Inter Bold. Simple, no icon for MVP.

**Colors:** Primary blue (#3B82F6) or neutral gray (#1F2937) on light backgrounds.

---

## Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Primary | #3B82F6 | 59, 130, 246 | Buttons, links, active states |
| Primary Hover | #2563EB | 37, 99, 235 | Button hover |
| Primary Light | #DBEAFE | 219, 234, 254 | Backgrounds, highlights |

### Neutral Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Gray 900 | #1F2937 | 31, 41, 55 | Primary text |
| Gray 700 | #374151 | 55, 65, 81 | Secondary text |
| Gray 500 | #6B7280 | 107, 114, 128 | Muted text, placeholders |
| Gray 300 | #D1D5DB | 209, 213, 219 | Borders |
| Gray 100 | #F3F4F6 | 243, 244, 246 | Subtle backgrounds |
| White | #FFFFFF | 255, 255, 255 | Page background |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| Success | #10B981 | Completed tasks, confirmations |
| Warning | #F59E0B | Due soon, cautions |
| Error | #EF4444 | Overdue, errors, destructive |
| Info | #3B82F6 | Informational (same as primary) |

### Dark Mode

**Yes — planned for v1.1, not MVP.**

Dark palette will invert neutrals and adjust primary for accessibility.

---

## Typography

### Font Families

| Usage | Font | Fallback |
|-------|------|----------|
| Headings | Inter | system-ui, sans-serif |
| Body | Inter | system-ui, sans-serif |
| Monospace | JetBrains Mono | monospace |

**Why Inter:** Free, excellent readability, variable font for performance.

### Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| H1 | 30px | 700 | 1.2 | Page titles |
| H2 | 24px | 600 | 1.3 | Section headers |
| H3 | 18px | 600 | 1.4 | Card titles, subsections |
| Body | 16px | 400 | 1.5 | Paragraphs, task text |
| Small | 14px | 400 | 1.5 | Labels, metadata |
| XS | 12px | 500 | 1.4 | Badges, timestamps |

---

## Spacing & Layout

### Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon padding, tight gaps |
| sm | 8px | Between related elements |
| md | 16px | Default padding, margins |
| lg | 24px | Section spacing |
| xl | 32px | Page padding, large gaps |
| 2xl | 48px | Hero spacing |

### Grid System

- **Max width:** 1200px (centered)
- **Columns:** 12-column grid
- **Gutter:** 24px
- **Sidebar:** 240px fixed (collapsible on mobile)

### Breakpoints

| Name | Width | Description |
|------|-------|-------------|
| Mobile | < 640px | Single column, bottom nav |
| Tablet | 640-1024px | Sidebar collapsed by default |
| Desktop | > 1024px | Full layout with sidebar |

---

## Components

### Buttons

| Variant | Background | Text | Border | Usage |
|---------|------------|------|--------|-------|
| Primary | #3B82F6 | white | none | Main actions (Save, Create) |
| Secondary | transparent | #3B82F6 | #3B82F6 | Alternative actions |
| Ghost | transparent | #374151 | none | Tertiary, toolbar actions |
| Destructive | #EF4444 | white | none | Delete, remove |

**States:** hover (darken 10%), active (darken 15%), disabled (50% opacity)

**Sizing:** 
- Default: 40px height, 16px padding
- Small: 32px height, 12px padding

### Form Elements

| Element | Style |
|---------|-------|
| Input | 40px height, 1px gray-300 border, 8px radius |
| Focus | 2px primary ring |
| Error | Red border, error text below |
| Checkbox | 18px, rounded-sm, primary fill when checked |

### Cards

- **Padding:** 16px
- **Border:** 1px gray-200
- **Border Radius:** 8px
- **Shadow:** none (use border for definition)
- **Hover:** subtle background change (#F9FAFB)

### Task Item

- **Height:** 48px minimum
- **Checkbox:** left aligned, 18px
- **Title:** Body size, truncate with ellipsis
- **Metadata:** right aligned, small text, muted
- **Hover:** show action icons (edit, timer, delete)

---

## Iconography

| Style | Library | Notes |
|-------|---------|-------|
| Outline | Heroicons | 24px default, 20px for compact UI |

**Stroke:** 1.5px
**Consistency:** Use outline style throughout, never mix solid and outline.

---

## Motion & Animation

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Hover | 150ms | ease-out | Button, card hover |
| Transition | 200ms | ease-in-out | Page transitions, modals |
| Micro | 100ms | ease-out | Checkbox, toggle |

**Principle:** Motion should feel instant and responsive. No bouncy, playful animations.

**Reduced Motion:** Respect `prefers-reduced-motion` — disable non-essential animations.

---

## Performance Targets

| Metric | Target |
|--------|--------|
| LCP (Largest Contentful Paint) | < 1.5s |
| FCP (First Contentful Paint) | < 1.0s |
| CLS (Cumulative Layout Shift) | < 0.1 |
| TTI (Time to Interactive) | < 2.0s |

---

## Reference & Inspiration

| App/Site | What We Like |
|----------|--------------|
| Things 3 | Calm aesthetic, whitespace, task completion animation |
| Linear | Speed, keyboard-first, minimal chrome |
| Notion | Clean typography, sidebar navigation |
| Vercel Dashboard | Monochrome palette, clear hierarchy |

---

## Design Tokens Export

Tokens exported as CSS custom properties in `tokens.css`:

```css
:root {
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-text: #1F2937;
  --color-text-muted: #6B7280;
  --color-border: #D1D5DB;
  --color-bg: #FFFFFF;
  --color-bg-subtle: #F3F4F6;
  
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```
