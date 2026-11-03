# Decision Log

> **Purpose:** Record significant architectural, design, and product decisions with context and rationale.
> Reference entries from other docs using the decision ID (e.g., "see DEC-003").

---

## How to Use

For each significant decision:
1. Assign the next sequential ID
2. Record the context, options considered, and final decision
3. Note who made it and when
4. Link from relevant docs (e.g., Architecture, PRD)

---

## Decisions

### DEC-001: Per-item quantity tracking mode (exact vs. level) with count freshness

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted (confirmed by Colin 2026-11-03) |
| **Deciders** | Colin |
| **Category** | Product |

**Context:**

Some stock needs precise counts. For a run of PCBs I must know I have enough of a specific IC, resistor or capacitor. Other stock (nails, common screws) doesn't justify counting. Forcing exact counts on everything adds update friction, and friction is what killed the previous attempt. Exact counts also go stale over time, especially for items in active use.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Exact count for everything | Simple model, precise | High friction for bulk consumables; counts drift anyway |
| Levels only (plenty / low / out) | Very low friction | Useless for planning a board run |
| **Per-item tracking mode** (exact *or* level), defaulted by category, plus a "last counted" date | Precision where it matters, low friction elsewhere; staleness is visible | Slightly more complex model and UI |

**Decision:**

Per-item tracking mode:
- **Exact**: integer count. Using a part subtracts from the count.
- **Level**: plenty / low / out. Using a part only prompts "still plenty?"

The mode is defaulted from the item's category (e.g. electronic components → exact; fasteners and nails → level) and can be overridden per item. Every stock record keeps a **last counted / verified date**. Exact counts that are old, or that have had a lot of usage since the last count, are flagged as "stale, recount?".

**Rationale:**

This matches how much precision each thing actually needs, keeps update friction low for bulk items, and puts the freshness log from the previous attempt (which worked) into the data model.

**Consequences:**

- The data model needs `tracking_mode`, `quantity` / `level`, and `last_counted_at` on stock.
- Project planning ("do I have enough for N boards?") only works for exact-mode items.
- Possible future: quick "recount" flow, count-by-weight, a low-stock shopping list (post-ship candidates).

**Related:**
- Referenced in: `06-Data-Model.md` (Stock), `02-PRD.md` (F3)

---

### DEC-002: Mobile-first responsive web; Pi garage station after ship

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product / UX |

**Context:**

I'll use the app from my iPhone in the garage (cell + Tailscale), and I want a Raspberry Pi with a screen and USB scanner as a fixed garage station. I was tempted to build both for the first version.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Mobile-first web; Pi kiosk post-ship** | One codebase; the Pi gets the same web app; ship sooner | Pi-specific polish waits |
| Both as first-class targets for the SPV | Garage station from day one | Kiosk setup + layout work delays ship; risk of over-building |
| Native iOS app | Native camera/Bluetooth | Cost, App Store, not free to distribute; the Pi is left out |

**Decision:**

A mobile-first responsive web app. The Pi works as a browser from day one; dedicated kiosk setup (auto-launch, scanner, Put-back mode default) goes to the Post-Ship Backlog.

**Rationale:**

The scanner acts as a keyboard on both devices (USB on the Pi, Bluetooth on the iPhone), so one "scan-ready input" covers both. The Pi adds almost no feature work, only setup. That can come after ship without rework.

**Consequences:**

- Scan input must work as keyboard input (fast burst + Enter), with phone camera scanning as a fallback.
- Layouts must work at phone width first and scale up to the Pi screen.

---

### DEC-003: HTTPS & access via Tailscale Serve for the SPV; Cloudflare Tunnel + Access later for viewers

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted (confirmed by Colin 2026-11-03) |
| **Deciders** | Colin |
| **Category** | Architecture |

**Context:**

The phone camera in the browser requires HTTPS. The app runs on the home lab server (Ubuntu, Docker). I reach it from the garage over cell + Tailscale. Later, my spouse and friends need read-only access, and they may not be on my tailnet. Must stay $0.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Tailscale Serve** (`*.ts.net` HTTPS cert) | Free; already set up; not exposed publicly; tailnet membership = auth, so no login to build | Only reachable by tailnet members |
| Cloudflare Tunnel + Cloudflare Access (2FA / email OTP / Google) | Free tier; reachable by anyone I allow without Tailscale; Access handles auth | Public internet exposure; requires a domain on Cloudflare (~$10/yr if not already owned); more setup |
| Self-managed reverse proxy + Let's Encrypt + app login | Full control | Port forwarding, building auth, more attack surface |

**Decision:**

**Tailscale Serve for the SPV** (single user, no app-level auth). Add **Cloudflare Tunnel + Access** when viewer access (post-ship) is built. Access then provides identity, so the app can map the verified email to a role (owner/viewer) instead of building a password system.

**Rationale:**

Zero exposure and zero auth work for the first ship, using tools already in place. Cloudflare is the right tool for the sharing problem, which isn't in the SPV.

**Consequences:**

- The SPV has no login screen. Anyone on the tailnet is the owner.
- App design should leave room for a "current user + role" from a trusted header later (Cloudflare Access).
- Confirm whether a domain is already owned before the viewer-access work.

---

### DEC-004: Tech stack: TypeScript, React (Vite SPA/PWA) + Hono + SQLite/Drizzle, single Docker container

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted (confirmed by Colin 2026-11-03) |
| **Deciders** | Colin |
| **Category** | Tech Stack |

**Context:**

One user, self-hosted on Ubuntu + Docker, $0, weak garage connection, scan-heavy mobile UI. Preference: TypeScript + React.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Vite React SPA + Hono API, SQLite (Drizzle)** | Simple single container; PWA caching suits flaky signal; SQLite = one-file backups | Hand-rolled API layer |
| Next.js + SQLite | One framework for UI + API | SSR/RSC complexity with no benefit here; heavier |
| React + Postgres | Robust, scales | An extra container to run and back up; overkill for one user |
| React + PocketBase/Supabase (self-hosted) | Built-in auth, admin UI | Another system to learn; less control over scan/stock logic |

**Decision:**

React + Vite (PWA) frontend, Hono on Node backend, SQLite via Drizzle (FTS5 search), shared Zod types; one Docker image with a `/data` volume.

**Rationale:**

The fewest moving parts that meet every requirement. SQLite's single file makes the backup requirement (F8) trivial. The PWA shell keeps it snappy over cell.

**Consequences:**

- Single writer, which is fine for one user plus occasional viewers.
- Migrating to Postgres later is possible via Drizzle if ever needed (unlikely).

---

### DEC-005: SPV scope and ship date

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Scope |

**Context:**

The previous attempt never reached a usable, maintained state. The garage clean-out is happening now, and the app should be usable for cataloging during it.

**Decision:**

**SPV = PRD F1–F8** (scan anywhere, locations & stickers, items & stock, search/use, quick capture + Needs details, Put-back mode, activity log, backups), live on the iPhone via Tailscale HTTPS. **Ship date: 2026-11-23.** Milestones: M1 walking skeleton 2026-11-08, M2 core inventory 2026-11-15 (start cataloging), M3 put-back + hardening 2026-11-21.

F9 (bulk move) and F10 (check out/in) are Should-haves: build them only if the SPV is done early, otherwise first after ship.

**Rationale:**

F1–F8 is the smallest loop that keeps data current (catalog → find → use → put back), which is exactly what failed before. Everything else is in the Post-Ship Backlog.

**Consequences:**

- New ideas get "does this block the SPV?". If not, they go to the backlog.
- If 2026-11-23 is at risk, cut scope (e.g. defer level mode or the camera scanner in favor of the Bluetooth scanner) rather than move the date.

---

### DEC-006: Resize photos on the phone, not the server

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted |
| **Deciders** | AI (during M2 build) |
| **Category** | Architecture |

**Context:** Phone photos are 3–12 MB, the garage is on cell, and the API contract planned server-side resizing.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Resize in the browser (canvas) and upload a 1600 px photo + 360 px thumbnail** | Uploads ~200–400 KB instead of MBs over cell; no native image library in the container | Original full-resolution photo isn't kept |
| Server-side with `sharp` | Keeps originals | Full-size uploads over cell; native dependency in Docker |

**Decision:** Resize in the browser.

**Rationale:** Upload speed over cell matters more than archival originals for inventory photos.

**Consequences:** Photos are capped at 1600 px. If originals are ever wanted, add a setting to upload them as-is.

---

### DEC-007: When an item leaves "Needs details"

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-02 |
| **Status** | Accepted (confirmed by Colin 2026-11-03) |
| **Deciders** | AI (during M2 build); confirmed by Colin |
| **Category** | Product |

**Context:** PRD open question: which fields are required before an item leaves the Needs details queue?

**Decision:** Quick-captured items are in the queue. An item leaves it the first time its details form is saved (a name is required there; nothing else). Items created with both a name and a category skip the queue.

**Rationale:** Required fields add friction, and friction is what killed the last attempt. Saving the form is a deliberate "I've looked at this" signal.

**Consequences:** Items can leave the queue with only a name. Easy to tighten later (e.g. require a category) without a data change.

---

### DEC-008: Backups run inside the app, not host cron

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | AI (during M3 build) |
| **Category** | Architecture |

**Context:** F8 needs nightly DB + photo backups to a second drive. The architecture left "host cron or sidecar" open. The app is currently running on a laptop and will move to Docker on the server.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Timer inside the app** (SQLite online backup + photo sync, status shown in the app) | Same on laptop and Docker; nothing extra to install; failures visible in the UI; uses SQLite's safe live backup | Only runs while the app runs (it does: `restart: unless-stopped`) |
| Host cron + `sqlite3 .backup` | Independent of the app | Separate setup per machine; failures are silent; needs sqlite3 on the host |
| Sidecar container | Isolated | Another container to run and watch |

**Decision:** In-app. `BACKUP_DIR` mounted from the second drive; nightly at `BACKUP_HOUR`, plus at start-up if overdue; each snapshot is integrity-checked; 14 kept.

**Rationale:** The last attempt's lesson is that silent decay kills the system. A backup whose status shows on the Activity screen is one that gets noticed when it breaks.

**Consequences:** Same-machine backups until the main backup system is fixed (noted in DEPLOY.md). Pointing `BACKUP_DIR` at the real backup system later is a config change.

---

### DEC-009: The put-back bin is physical only

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** The app had a built-in "Put-back bin" location, so items could be recorded as sitting in it, and put-back mode moved them out again. That gave two ways to do the same thing (− when taking parts vs. Move to the put-back bin), which was confusing.

**Decision:** The put-back bin is just a physical box. Taking parts = tap −. Leftovers go in the physical bin with no app step. Emptying it = Put-back mode: scan the bin each thing goes into (+1), or the item's own sticker.

**Rationale:** One way to do each job; matches "don't overcomplicate it" (UX framework).

**Consequences:** The old built-in location is deleted (migrations 0003–0004) and the `put_back` location type removed. Put-back mode never moves stock between locations, only adds back.

---

### DEC-010: Sites as the top level of the location tree

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** Some things aren't kept in the garage. Needed a name and a model for "other places".

**Options Considered:** "Facility" (sounds like a warehouse), "Place"/"Area" (too vague next to "location"), **"Site"**.

**Decision:** A location type `site`. Sites are the only top-level locations; everything else must be inside one (enforced by the API). Existing top-level locations moved into a "Garage" site (migration 0006). With one site, Home shows that site's contents directly; with several, Home lists them. Sites can't be moved and don't nag for stickers.

**Rationale:** Reuses the location tree (paths, search, moves all just work) instead of adding a separate concept.

**Consequences:** Every path starts with the site ("Garage › Rack A › …"). A fresh install asks you to name your first site.

---

### DEC-011: The app is called "Bin There"

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** "Stack-n-Track" was a working name and Colin didn't like it. Renaming before the move to the server keeps the old name out of container names, server folders and the home-screen icon.

**Options Considered:** Binwise, **Bin There**, Stash, Trove, Whereabouts, Parts Bin.

**Decision:** **Bin There.** Code slug `bin-there` (package, container, server folder, backup folder).

**Rationale:** A pun on "been there" that fits the app's core question (where has this been, where does it go back?) and reads well as an icon label.

**Consequences:** Renamed across the code and docs on 2026-11-03. Older research notes and session-log entries keep the old name as history. A home-screen icon added before the rename keeps the old label until it's re-added. The project folder on the Mac is still `stack-n-track`.

---

### DEC-012: Kit leftovers live in `framework/kit/`

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Process |

**Context:** The repo was scaffolded from ai-framework kit 1.1.0, which left files in the root and in `framework/` that belong to the kit rather than to Bin There: the kit changelog, the example project, the discovery questions, and the never-used UI-prompt template.

**Decision:** Move them to `framework/kit/` (with a README saying what they are) rather than delete them. Links in `AGENTS.md`, `AI-Context.md` and `09-Process-Guide.md` point at the new paths. The one-line editor redirects (`.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`) and `LICENSE` stay in the root.

**Rationale:** The root and `framework/` then contain only this project's own docs, while the kit material stays findable if the process is ever rerun.

**Consequences:** Future kit upgrades compare against `framework/kit/`, not the root.

---

### DEC-013: Deleting is a soft delete, and an item delete is undoable

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** The shipped SPV had no way to delete or archive anything: the database had an `archived` flag that nothing set. A mistaken quick capture was permanent. Found in the post-ship code audit.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Hard delete rows | Simple | Activity-log entries would point at nothing; no undo |
| **Soft delete (archive flag), history kept** | Log stays whole; an item delete can be undone like any other change | Rows stay in the database (fine at this scale) |

**Decision:** "Delete" sets `archived`. An archived item disappears from search, locations, scans and pins; its stickers are freed so they can go on something else; the delete is an activity-log event with Undo (which also restores the stickers, unless one has been reused since). A location can only be deleted when it holds nothing; its sticker is freed; this one isn't undoable (it was empty, so re-creating it is cheap).

**Rationale:** Matches the "every change is logged and undoable" rule the rest of the app follows, and keeps the activity log honest.

**Consequences:** `DELETE /api/items/:id` and `DELETE /api/locations/:id`; a new `archive` event type. No way to list or restore archived things from the UI beyond Undo; if that's ever needed it's a small addition.

### DEC-014: Gridded boxes are drawn as a grid; bins are placed by drag-and-drop

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** J5 asked for a visual grid of each organizer box so a bin can be found by place, not just by name. The data model had grid columns on `locations` from the start, unused. The first post-ship feature Colin picked.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Tap a bin, then tap its cell | Simplest; no gesture conflicts | Two taps per bin; doesn't feel like moving a bin |
| **Drag a bin and snap it into the nearest free slot** | Feels like the real box; one motion per bin | Touch dragging has to be kept out of page scrolling |
| A separate "layout editor" screen | Keeps the box screen simple | Another screen to find; layout and contents drift apart |

**Decision:** The box screen shows the grid (6 × 4 cells plus the front strip along the bottom) with bins in their real colors in their slots, and a tray of bins not placed yet. An **Arrange** toggle turns on dragging: the bin follows the finger with a green preview of where it will land, snaps on release to the nearest free slot within one cell (red if nothing fits, and it springs back), and a drop in the tray takes it off the grid. A tap on a placed 2×1 turns it. Outside Arrange, tapping a bin opens it and the page scrolls normally. Every gridded box is assumed to be the Allit case unless its `grid_cols`/`grid_rows` say otherwise (no UI for that yet). Placement isn't logged in the activity log: it's layout, not stock.

**Rationale:** Drag-and-drop was what Colin asked for once offered the choice; snapping removes the precision problem on a phone, and the Arrange toggle removes the scroll conflict without a long-press.

**Consequences:** `PUT /api/locations/:id/slot`; migration 0007 adds `grid_rotated`; the fit rules live in `src/shared/grid.ts` so the screen and the server agree. Moving a bin to another box, or changing its size, clears its slot. The grid needs no library: pointer events plus `touch-action: none` while arranging.

### DEC-015: Stale counts get a review list with one-tap "Still N"

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** DEC-001 flags an exact count as stale after 90 days or 10 nudges, but the flag only showed on the item's own screen, so stale counts were found by accident.

**Decision:** Home shows "N counts worth checking" when there are any. It opens a list grouped by location, in walking order, where each row has **Still N** (a recount at the same number: one tap, resets freshness, logged as a recount with delta 0) and **Different…** (type the real number). Both go through the normal recount endpoint, so they're logged and undoable. The thresholds stay as they were.

**Rationale:** A review session should be mostly tapping. Reusing recount keeps the undo invariant without a new event type.

**Consequences:** `GET /api/review`; `stale` in `/api/stats`. No new tables.

---

### DEC-016: Low-stock list from levels plus a per-item threshold

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** The data model had `low_threshold` on items from the start, unused and unsettable.

**Decision:** "Running low" lists level items that are low or out anywhere, plus exact items whose total is zero or at/below their threshold. The threshold is a plain number on the item's edit screen (blank = no warning); uncounted items are never "low". Worst first (out before low). A **Copy** button puts the list on the clipboard as plain text. No "mark as bought": restocking (a + or a level change) takes things off the list on its own.

**Rationale:** The smallest thing that works as a shopping list without a second place to keep state.

**Consequences:** `GET /api/items/low`; `lowThreshold` on item summaries and in `PATCH /api/items/:id`; `low` in `/api/stats`.

---

### DEC-017: Deletions are purged for good after 30 days, history included

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** DEC-013 made delete a soft delete. The backlog note said a purge could keep a "Deleted" line in the log, but events point at items by foreign key, so an item can't go without its events.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep a tombstone row and only free photos/stock | Log line survives | The item lingers; Undo on a gutted item needs guarding |
| **Remove the item and everything about it** | Clean; nothing half-deleted | The "Deleted" log line goes too, after 30 days |

**Decision:** A nightly housekeeping job (and one on start) removes items deleted more than 30 days ago: photo files, photos, stock, homes, units, pins, events, search row, and the item. Thirty days is the undo window in practice; the activity screen only shows recent history anyway.

**Consequences:** `src/server/housekeeping.ts`, scheduled an hour after the backup hour. Nothing in the API. Locations are not purged (they're tiny and keep the tree's history whole).

---

### DEC-018: Light mode is a per-device setting, default dark

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** The style guide was dark-first with tokens ready for a swap.

**Decision:** Three choices at the bottom of Home: **Device** (follow the phone's setting), **Dark**, **Light**. Stored in the browser on that device, applied before the app renders so there's no flash, and the status-bar color follows. Default stays dark. Light tokens darken the accent and status colors for contrast on white; bin colors don't change.

**Rationale:** No account, so per-device is the only place to keep it; dark stays the default because garage use is the main case.

**Consequences:** `src/web/theme.ts`, light tokens in `index.css`. New UI must use the tokens (no hard-coded colors) to work in both.

---

## Decision Index

| ID | Title | Category | Status | Date |
|----|-------|----------|--------|------|
| DEC-001 | Per-item quantity tracking mode (exact vs. level) + count freshness | Product | Accepted | 2026-11-02 |
| DEC-002 | Mobile-first responsive web; Pi garage station after ship | Product / UX | Accepted | 2026-11-02 |
| DEC-003 | Tailscale Serve for SPV; Cloudflare Tunnel + Access later for viewers | Architecture | Accepted | 2026-11-02 |
| DEC-004 | TypeScript: React (Vite PWA) + Hono + SQLite/Drizzle, one container | Tech Stack | Accepted | 2026-11-02 |
| DEC-005 | SPV = F1–F8, ship 2026-11-23 | Scope | Accepted | 2026-11-02 |
| DEC-006 | Resize photos on the phone, not the server | Architecture | Accepted | 2026-11-02 |
| DEC-007 | When an item leaves "Needs details" | Product | Accepted | 2026-11-02 |
| DEC-008 | Backups run inside the app, not host cron | Architecture | Accepted | 2026-11-03 |
| DEC-009 | The put-back bin is physical only | Product | Accepted | 2026-11-03 |
| DEC-010 | Sites as the top level of the location tree | Product | Accepted | 2026-11-03 |
| DEC-011 | The app is called "Bin There" | Product | Accepted | 2026-11-03 |
| DEC-012 | Kit leftovers live in `framework/kit/` | Process | Accepted | 2026-11-03 |
| DEC-013 | Deleting is a soft delete; item delete is undoable | Product | Accepted | 2026-11-03 |
| DEC-014 | Gridded boxes drawn as a grid; bins placed by drag-and-drop | UX | Accepted | 2026-11-03 |
| DEC-015 | Stale counts get a review list with one-tap "Still N" | Product | Accepted | 2026-11-03 |
| DEC-016 | Low-stock list from levels plus a per-item threshold | Product | Accepted | 2026-11-03 |
| DEC-017 | Deletions purged for good after 30 days, history included | Product | Accepted | 2026-11-03 |
| DEC-018 | Light mode is a per-device setting, default dark | UX | Accepted | 2026-11-03 |

---

## Template

Copy this for new decisions:

```markdown
### DEC-XXX: [Decision Title]

| Attribute | Value |
|-----------|-------|
| **Date** | YYYY-MM-DD |
| **Status** | Proposed / Accepted / Superseded / Deprecated |
| **Deciders** | [Names] |
| **Category** | Architecture / Tech Stack / Product / UX / Process / Scope |

**Context:**
[TODO]

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Option A | | |
| Option B | | |

**Decision:**
[TODO]

**Rationale:**
[TODO]

**Consequences:**
[TODO]

**Related:**
- Referenced in: [TODO]
```
