# Visual Style Guide

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

**Clean and minimal, dark mode first.** A quiet, near-black interface where content (part names, quantities, location paths, photos) stands out. One accent color for actions. Big, unmistakable tap targets for +/− and scan. It must read clearly on a phone in garage lighting. **Light mode** shipped 2026-11-03 (DEC-018) as a token swap: `html[data-theme="light"]` in `src/web/index.css` overrides the color tokens; the bin colors stay the same because they match the real bins. The choice (Device / Dark / Light) is at the bottom of the Locations screen (DEC-026), stored per device; the default is dark.

**Photos are square** (DEC-030): lists, tiles, panes and the part's page all show a part's photo as a square, picked by its crop (centred unless adjusted). The whole photo is a tap away.

**Bin tiles** (DEC-036): a bin with a photo shows it inside a 3 px frame of the bin's colour, so the colour still matches the real bin. Big tiles add the name on a dark strip along the bottom; wide tiles put a square thumbnail beside the name; tall ones put the photo above it.

**Tone words:** calm, precise, fast, utilitarian. No decoration that costs taps or bytes.

---

## Brand Guidelines

### Existing Brand Assets
None. Starting fresh. Name: **Bin There** (DEC-011). Logo TBD.

---

## Color Palette

*(Dark theme. Values are a starting point and can be tuned during the build. All text pairs meet WCAG AA 4.5:1.)*

### Primary Colors

| Token | Hex | Use |
|-------|-----|-----|
| `accent` | `#38BDF8` | Primary buttons, scan button, links, focus ring |
| `accent-fg` | `#0B1220` | Text on accent |

### Neutral Colors

| Token | Hex | Use |
|-------|-----|-----|
| `bg` | `#0E0F11` | App background |
| `surface` | `#17191C` | Cards, list rows |
| `surface-2` | `#212429` | Raised elements, inputs, sheets |
| `border` | `#2C3036` | Dividers, outlines |
| `text` | `#E8EAED` | Primary text |
| `text-muted` | `#9AA0A6` | Secondary text, breadcrumbs |

### Semantic Colors

| Token | Hex | Use |
|-------|-----|-----|
| `ok` | `#34D399` | Stock "plenty", success toasts, checked in |
| `warn` | `#FBBF24` | Stock "low", **stale count** badge, "needs details" |
| `danger` | `#F87171` | Stock "out", destructive actions |
| `info` | `#A78BFA` | Checked-out returnables |

Semantic states always come with a text label or icon too (never color alone).

### Bin Size Colors

Bins are color-coded by size in real life, and the app should use **the same colors** so a bin on screen looks like the bin in hand. Always paired with a size label (e.g. `2×1`).

Bins: **Allit economy modular storage case** (Lee Valley #70869): https://www.leevalley.com/en-us/shop/hardware/storage-and-organization/containers/70869-allit-economy-modular-storage-case

| Size | Real bin color | Hex (dark-theme tuned) | Token |
|------|----------------|------------------------|-------|
| 1×1 | Red | `#EF4444` | `bin-1x1` |
| 2×1 (1×2) | Yellow | `#FACC15` | `bin-2x1` |
| 2×2 | Blue | `#3B82F6` | `bin-2x2` |
| Front strip (346 × 46 mm) | Matches the case (neutral) | `#9AA0A6` | `bin-front` |

On the box grid the colour is the tile's 3 px outline round a dark inside, not a fill (DEC-041); empty bins look the same with a muted "Empty". The small bin chip in lists stays solid.

**Case layout (from the product description):** 365 × 292 × 55 mm case; bins are 43 mm deep. A **6 × 4 grid** of 51 mm cells (each cell ~53 mm with walls) plus one full-width **front strip** bin. Stock set: 8× 1×1, 4× 2×1, 2× 2×2, 1 front strip = 24 grid cells + strip. Bins are also sold separately, so the mix per case can vary.

Bin chips are rendered as small filled rectangles in the bin color **with the size label inside**, so they never get confused with the amber `warn` badge.

### Dark Mode
Dark is the default and only theme for the SPV. Light mode is in the post-ship backlog. All colors are CSS variables / Tailwind theme tokens so light mode only needs a second token set.

---

## Typography

### Font Families
- **UI:** system font stack (`-apple-system, system-ui, …`). Zero download, native feel on iPhone.
- **Numbers / codes / part numbers:** `ui-monospace` with tabular figures so quantities and sticker IDs line up.

### Type Scale

| Token | Size / weight | Use |
|-------|---------------|-----|
| `display` | 32px / 600 | Big quantity on item screen |
| `title` | 20px / 600 | Screen titles |
| `body` | 16px / 400 | Default (16px avoids iOS zoom-on-focus) |
| `meta` | 13px / 400 | Breadcrumbs, timestamps |

---

## Spacing & Layout

### Spacing Scale
4px base: 4, 8, 12, 16, 24, 32.

### Layout
- Phone-first single column; bottom action bar for thumb reach: **Search · Scan · Put-back**
- Persistent **scan button** (camera) reachable from every main screen (F1)
- Location breadcrumb at the top of item and location screens

### Breakpoints
`sm` < 640 (phone, primary) · `md` 640–1024 (Pi screen / tablet: two columns) · `lg` > 1024 (desktop)

---

## Components

### Buttons
- Primary (accent fill), secondary (surface-2 + border), ghost, danger
- **Stepper (+/−):** ≥ 56×56px, the largest controls in the app; long-press for repeat; tap the number to type a value
- Minimum 44×44px for everything else

### Cards / List rows
Thumbnail (photo) · name · quantity or level badge · location path (muted) · stale/needs-details badge if relevant

### Sheets
Bottom sheets (not centered modals) for quick actions after a scan: easier one-handed.

### Toasts
Every stock change shows a toast with **Undo** (~5 s).

---

## Iconography
Lucide icons (outline, 1.5px stroke). Scan = `scan-line`, put-back = `undo-2`/`archive-restore`, check-out = `log-out`.

## Motion & Animation
Minimal: 150 ms fades/slides for sheets and toasts. Respect `prefers-reduced-motion`. Haptic-like feedback is not available in iOS Safari, so a short visual flash confirms each scan.

## Performance Targets
LCP < 2.5 s, CLS < 0.1, FCP < 1.8 s on a cell connection. App shell cached (PWA); thumbnails, not full photos, in lists.

## Reference & Inspiration
`[TBD: optional; user can name apps they like]`

## Design Tokens Export
Defined as CSS custom properties consumed by the Tailwind theme (`--color-bg`, `--color-accent`, `--color-bin-2x1`, …).
