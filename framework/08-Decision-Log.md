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
| **Status** | Accepted (confirmed by Colin 2026-11-03; confirmed again 2026-11-04, Q47: a name alone isn't enough, a part needs its category too) |
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

### DEC-019: Project kits are locations that are never a home

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** J4: pull parts from all over into a kit for one project, have each remember its home, and see the kit as one of the places a part exists, even years later if the project is shelved. The `project` location type was reserved for this.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| A separate "kit" table with its own membership rows | Explicit | Parts in a kit would not be ordinary stock, so search, totals, +/− and the activity log would all need a second path |
| **A kit is a `project` location; stock and units sit in it like anywhere else, but a kit is never a home** | Everything that works for locations works for kits; "return" is just moves back to the home the data already keeps | One rule to enforce in a few places (move, put-back, create) |

**Decision:** A kit is a location of type `project` (usually under the site). Pulling into it is a normal move or check-out, except that moving everything out of a home into a kit does not move the home, and nothing created or put back inside a kit gets the kit as its home. The kit screen has **Pull in a part** (search, or scan a part's sticker to check it out, or a bin's sticker to pick from its contents), per-part **Return**, **Return everything**, and **Finish project** (return everything, then delete the kit if it's empty). What the project used up is taken off with − before finishing. Things with no home are left in the kit and listed, rather than guessed at. Each return is one ordinary move or check-in event, undoable one at a time.

**Rationale:** Reusing stock and units keeps one set of rules; the single "never a home" invariant is enough to make return work. A level-tracked item (screws) can't be moved by count, so pulling it into a kit just records that some are there.

**Consequences:** `GET /api/projects`, `POST /api/projects/:id/return`; `isProject` guard in items/stock/put-back; `homePath` on location items; Projects section on Home (kits don't also appear in the Locations list). A shelved project is simply a kit left alone.

### DEC-020: Bins are numbered, show their contents, and are dragged in from a palette

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted (bin numbering superseded by DEC-023; the bin sheet reworked by DEC-024) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Filling a gridded box with its 20-odd bins is a job Colin will do often. Each bin cost a form (type, size, a made-up name, Save), a trip to the new bin's screen, back, Arrange, drag. Naming bins was busywork: there is nothing to call a bin except what's in it. And once in the form there was no visible way out.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep names, add a global bin ID (0001, 0002…) | Unique across the garage | A second number next to the sticker code, which already is the printed, scannable ID |
| Name a bin after its contents | No naming | The name would change every time something moved; paths and old log lines would drift |
| **Number bins within their box; show contents on the tile; drag new bins in from a palette; add parts from a sheet on the grid** | No typing to add a bin; the grid reads as what's where; the identity ("Bin 3 in Screws box") stays put | A sheet on top of the grid is one more surface to keep simple |

**Decision:** A bin's name is optional; left blank, it becomes "Bin N" with the next number in that box (archived bins keep their number, so numbers aren't reused). A global ID is the sticker code, not a second field. On the grid a bin's tile shows its first item and "+N" for the rest, or its number when empty. In Arrange mode a palette above the grid offers 1×1, 2×1 wide, 2×1 tall, 2×2 and front strip: drag one onto the grid and the bin is created in that slot (`POST /api/locations` with `slot`), nothing is created on a miss. Outside Arrange mode tapping a bin opens a sheet over the grid: its contents with +/−, a quick-add row (name, how many) that stays for the next part, a scan puts a fresh sticker on the bin or switches to a sibling, and an empty bin can be removed. Placed 2×1 bins carry a turn icon while arranging. The new-location and quick-capture screens have a Cancel/Done button.

**Rationale:** The palette reuses the drag the grid already has, so there is nothing new to learn; colour and shape say what you're adding. Keeping the bin's identity stable (number plus box) keeps paths, search results and the activity log readable while the tile shows what actually matters.

**Consequences:** `createLocationSchema.name` optional (bins only; everything else still 400s without one), `slot` accepted on create; `LocationSummary` gains `itemCount` and `preview`; `BinSheet.tsx`; `BoxGrid` gets `onCreate`/`onOpen`. The bin's full screen is still one tap away from the sheet.

### DEC-021: Camera scanning: our own decoder, one steady lens, and a labelling run

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted (decoder and lens); labelling run superseded by DEC-022 |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Putting stickers on a box of new bins took, per bin: tap the bin, tap its name, tap Assign sticker, approve the camera again, then wave the phone back and forth while the iPhone hopped between lenses and the decoder only read the code once it filled most of the frame. The guide square on screen was several times the size of a sticker.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep `@zxing/browser` (the JavaScript port) | Already in | Reads from a low-resolution frame, weak on small codes, project in maintenance mode |
| A paid/hosted scanning SDK | Best decode rates | Cost, and the app must work with no internet |
| **`zxing-wasm` (the C++ ZXing decoder compiled to WebAssembly, served by this app) plus the browser's own `BarcodeDetector` where it works; read the guide square at full resolution** | Free, offline, far better on small or soft codes; native decoder on Android for free | ~400 kB download the first time the camera opens (cached by the service worker) |

**Decision:**
- **Decoder.** `BarcodeDetector` when the browser reports QR support (Chrome on Android), otherwise `zxing-wasm` with its `.wasm` file bundled and served by the app. Frames are requested at up to 1080p; the part under the guide square is decoded at full resolution every frame and the whole frame, shrunk, every fourth, so a sticker reads either in the square or anywhere in view. The guide is 60 % of the short edge.
- **Lens.** On iPhones the default rear camera is a virtual one that swaps lenses as you move closer, which is what made focus hunt. The scanner now picks the plain "Back Camera" (the 1× lens, which focuses close enough for a sticker) and offers a lens button to choose another; the choice is remembered. There is no web API to select a macro lens by name; this is the nearest thing.
- **Permission.** The browser owns the camera prompt. The app can only ask less often: in a labelling run the camera stays open between scans, so one approval covers the whole box. In Safari the per-site setting (aA menu → Website Settings → Camera → Allow) stops the prompt for good.
- **Labelling run.** On a gridded box, **Stickers** walks the bins in grid order (across each row, then the front strip, then loose ones), skipping those that have one: "Put a sticker on Bin 3 (row 1, column 3) and scan it." Each scan (camera or hardware scanner) goes on that bin and the run moves on; Skip, Done, or tap a bin on the grid to do that one. The camera's title names the bin up next and shows a tick with the code after each read. A used sticker is refused with where it is. The bin sheet also has a camera button and in-place rename.

**Rationale:** Decoding at the sensor's resolution, from one lens that doesn't switch, fixes the two things that made scanning feel bad; the labelling run removes the per-bin navigation. Keeping the decoder in the app keeps the garage-only, no-internet setup intact.

**Consequences:** `@zxing/browser` removed, `zxing-wasm` added; `src/web/scan/camera.ts` (lens choice, guide crop; unit-tested), `decode.ts`, `CameraScanner.tsx` rewritten with `continuous`, `title`, `hint`, `extra`; `ScanProvider.openCamera(options)` and `closeCamera()`; `LabelBins.tsx`. Headless check feeds Chromium a video of a small QR code through a fake camera, so the real decoder is exercised.

### DEC-022: Stickers: tap a bin, aim, tap Scan

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted (the bin sheet's camera button removed by DEC-024) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** The labelling run from DEC-021 kept the camera open and assigned every code it read to the next bin in order. In use that was easy to get wrong: one sticker read out of turn shifted every bin after it, and with codes too small to read by eye there was no quick way to find where it went off track.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep the automatic run, add a confirm step | Fewer taps | Still an order to fall out of |
| Open and close the full-screen camera per bin | Simple | A camera start (and on some phones a permission prompt) for every bin |
| **One Stickers screen: camera preview above the grid; nothing happens until you tap a bin and then tap Scan** | You choose the bin and the moment; the camera starts once | One more tap per bin than the automatic run |

**Decision:** **Stickers** on a gridded box opens a screen with a live camera preview above the box's grid. The preview draws brackets round every QR code it sees and green brackets round the one nearest the white aim mark, with that code written large underneath and whose it is ("not used yet", "on Bin 0005", "on Bin 0003 ✓"). Nothing is assigned until you tap a bin (solid outline) and tap the Scan button, whose label says exactly what it will do: "Put BIN0007 on Bin 0003", "Move BIN0007 here from Bin 0005" (amber), or why it can't. After a scan the bin is unchosen, so each bin is a deliberate tap. The bin whose sticker the camera is pointed at gets a dashed outline, so a box can be checked just by pointing at its stickers, and a wrong one fixed with a move. The last change has Undo. Tiles show each bin's ID and the end of its sticker code. A hardware-scanner trigger on a chosen bin assigns straight away (the trigger is already deliberate). Every scan the app takes beeps (on/off switch, remembered) and buzzes: Android through the vibration API, iPhone through the iOS 18 switch-control haptic. A refused scan gives a low double tone. Elsewhere, any camera scan that writes a sticker (bin sheet, a location's Assign sticker) waits for a Scan tap; camera lookups still take the first code seen.

**Rationale:** Choosing the bin first, then the moment, removes the order the automatic run depended on. Showing what the camera sees, and whose sticker it is, before anything is written turns checking a box into pointing at it.

**Consequences:** `POST /api/locations/:id/code` takes `move: true` to take a sticker off another location (never off an item). New `CameraView.tsx` (preview, brackets, aim), `feedback.ts` (beep, buzz), `StickersView.tsx`; `CameraScanner` takes `tap`; `LabelBins.tsx` and the camera's continuous mode removed. The iPhone haptic relies on a Safari behaviour, not a documented API.

---

### DEC-023: Bin IDs are global and fixed-width (Bin 0001)

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** DEC-020 numbered bins within their box, so two boxes each had a Bin 1. Bins are modular: a bin moves from one box to another and should stay the same bin. And plain numbers 1, 2, 3 read as positions, as if the bins had to stay in order.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Use the sticker code as the bin's name | One identifier | The stickers carry random 12-character codes, hard to read or say |
| Global numbers, unpadded (Bin 12) | Unique | Still read as an order; sort wrongly (Bin 10 before Bin 2) |
| **Global, fixed-width IDs (Bin 0012)** | Unique across the garage; read as IDs; sort correctly | None worth noting below 10,000 bins |

**Decision:** An unnamed bin gets the next ID in the whole system, four digits: Bin 0001, Bin 0002, and so on. IDs aren't reused after a delete. A bin keeps its ID when moved to another box. On the grid a tile shows just the digits ("0012"); everywhere else the full "Bin 0012". Bins given their own name keep it. Migration 0008 renames existing automatic names ("Bin <number>") to IDs in the order the bins were created.

**Rationale:** The ID is only a differentiator; where a bin sits and what's in it are what matter, and the tile shows those. Fixed width makes it look like a label rather than a count.

**Consequences:** `nextBinName` is global and padded; `drizzle/0008_bin_numbers_unique.sql`. On the live data: Grid box 1's bins become Bin 0001 to 0010 and Grid box 2's Bin 0011 to 0025 (dry-run on a copy, stickers unchanged).

### DEC-024: Screens lead with what's there; sticker codes stay out of sight

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted (the pane's silent sticker scan changed by DEC-025) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin tried the bin sheet (DEC-020) while filling boxes. It gave the most room to an "Add a part" form even when the bin already had its part, and showed the bin's 12-character sticker code with a camera "Replace" button whose purpose wasn't clear: replace what? A pencil next to the bin name looked like it might edit the part. Colin asked for every screen to be checked for what the person actually needs to see. Most bins hold one kind of part, but some hold more.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep the sheet, shrink the sticker line | Small change | The add form still crowds out the part; the code is still there to be misread |
| Skip the sheet and open the part's own screen | One screen fewer | Loses the box context; empty bins have no part to open |
| **Sheet built around the bin's contents** | The part, its photo and count come first; adding is one tap away | The sticker is no longer one tap from the grid (it has the Stickers screen and the bin's own page) |

**Decision:** Each screen shows what's there before what you can do to it.
- **The bin sheet.** An empty bin opens on "What goes in it?": a name, a count, and a camera button for a photo, so a part you can't name yet can still be saved. A bin with one part shows that part's photo, name and count. If there's no photo, the photo spot is an "Add photo" button that opens the camera. A pencil renames the part in place, and "Add details" opens its full form. A bin with several parts lists them, each with its photo spot and count. "Add another part" opens the form again. The sheet shows no sticker, no sticker button, and no bin rename.
- **Sticker codes.** They are for the scanner, not for reading. A code shows only on its own location's page, in a short section at the bottom with "Replace sticker". Toasts and lists name the bin, not the code. Quick capture says a sticker is "Attached". The Stickers screen still shows codes, because checking stickers is its job.
- **Location pages.** Contents come first. Sticker, Move, Delete and any add buttons whose section is hidden go to a short section at the bottom. A section that would only say "nothing here" is hidden, unless filling it is what that kind of place is for: a gridded box has no empty Items list, and a bin has no Inside list or "Add inside". A location is renamed from its own page with the pencil by its name. Location lists say what's inside ("M3 nuts, washers +2", "4 inside", "Empty") instead of "no sticker".
- **Desktop.** A bin opens in the column beside the grid, with the bin outlined, instead of over the grid.
- **Toasts.** While a sheet is up from the bottom, toasts show at the top so they don't cover it.

**Rationale:** In a garage you open a bin to see or fix what's in it. Bins usually hold one thing, so that one thing deserves the space. Its photo matters most, because a part going into a bin is usually in your hand, and photos feed the planned photo search. Sticker codes are random strings nobody can read in small print, and showing them invites checking them by eye, which is the scanner's job.

**Consequences:** `BinSheet.tsx` rebuilt; new `PhotoSpot.tsx`, whose photo upload the item page now shares; `LocationPage.tsx` reordered. Renaming a part from the sheet keeps "needs details". This supersedes the parts of DEC-020 and DEC-022 that put the sticker code, the sheet's sticker button and the bin rename in the sheet. Scanning a fresh sticker with the hardware scanner while a sheet is open still put it on that bin; DEC-025 changed that to ask first.

### DEC-025: A scan never changes anything without saying so; flow review fixes

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-03 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** DEC-024 kept one hidden behaviour: with a bin pane open, scanning an unused sticker put it on that bin, and nothing on screen said a scan would do that. Colin pointed out there was no way to know. He also asked for user stories to check every flow against. Stories J9 to J14 were added to the UX framework, and all fourteen were walked through the app (`reports/UI flow review 2026-11-03.md`).

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep it, add a hint line to the pane | Still one scan | Puts sticker talk back into a pane meant for contents; a hint is easy to miss |
| Drop it: the scan opens the "New sticker" page | Same as everywhere else | Leaves the box mid-fill |
| **Ask in the pane when it happens** | Nothing written without a tap; explains itself at the moment it matters; you stay in the box | One more tap than before |

**Decision:** A scan changes something only where the screen says what a scan will do (put-back, project kits, pick-a-place, quick capture, Stickers, Assign sticker). Everywhere else a scan opens what was scanned. With a bin pane open, an unused sticker brings up "New sticker scanned. Is it the sticker for Bin 0001?" with **Put it on Bin 0001**, **It's for something else** (the New sticker page) and **Not now**. If the bin already has a sticker, it asks whether to use the new one instead.

The flow review also fixed:
- **Paths.** One-line paths keep the last place whole and shorten the outer ones first, and drop the site's name when there's only one site.
- **Pick from list.** It opens beside where the part is now, marks it "here now", and shows what's in each place.
- **Saving details.** It goes back to the screen the form was opened from.
- **Stale hint.** The new-bin hint now uses the new IDs.

**Rationale:** Writes you didn't ask for are how the data drifts, and drift is what sank the last attempt. A scan is an input like any other: the screen has to say what it will do with it.

**Consequences:** `BinSheet.tsx` asks before assigning; new `PlacePath` in `ui.tsx`; `PickLocation` takes `near`; `ItemEditPage` returns with `navigate(-1)`. The story walk and the earlier browser checks live in `scripts/ui-checks/`. Proposals from the review that aren't built yet are listed in the report, starting with what "needs details" should mean.

### DEC-026: Home is the inventory; Locations gets its own screen; Search is results only

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Home was the garage's list of places, with banners for what needed attention and pinned things on top. Colin asked for home to be a list of every part instead, with a search bar and filters, shown as a list (name, small photo, details across the row) or as tiles (big photo, a few details under it), with pinned parts on top. The list of places should be its own screen in the side bar, and Search should stay as a focused page that lists only what matches.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Keep places on home, add an Inventory tab | Browsing by place stays one tap | Finding a part (J1, the most common job) stays a tap further away |
| **Inventory as home, Locations as a tab** | Search is right at the top of home; every part is browsable and filterable; the attention banners become filters that show the parts | Getting to a place by browsing costs one more tap (scanning its sticker is unchanged) |

**Decision:**
- **Inventory (home, `/`).** A search bar, then filter chips, then the list or tiles. Pinned parts sit on top and keep their − / +.
  - **Filter chips.** Needs details, Running low, Checked out and Counts to check each show their count and appear only when there's something to show. They're followed by Category and Kind menus. Chips that are on move to the front, and a Clear chip appears.
  - **Sorting.** Sort by name, last changed, or newest first. Searching sorts by best match.
  - **Views.** List or tiles, remembered on the device.
  - **Address.** Filters are kept in the page address, so Back returns to the same filtered list.
  - **Loading.** Pages load 60 at a time as you scroll.
  - **Filter notes.** Running low offers "Copy as a shopping list". Checked out links to where things went. Counts to check links to the one-by-one review.
  - **Phone rows.** "Needs details" shows as a small pencil next to the name, the same pencil as on its filter chip, so the path keeps its room.
- **Locations (`/locations`).** What home used to be: the site's places, pinned places, project kits, add a location or site, and the theme choice.
- **Search (`/search`).** Results only. Nothing is listed until you type.
- **Navigation.**
  - **Phone bar:** Inventory, Locations, Scan, Activity, Put-back. On the phone, the search bar on Inventory is the search.
  - **Side bar:** Inventory, Locations, Search, Put-back, Activity.
- **Old address.** `/low` now opens Inventory with Running low on.

**Rationale:** Finding a part is the job the app lives or dies on (J1). Putting the search and every part on home makes it zero taps away. Filters with counts say what needs attention and show the parts in one place, instead of four banners that each opened a different screen.

**Consequences:**
- **New endpoint.** `GET /api/inventory` filters, sorts and pages, and returns pinned parts separately (`listInventory` in `items.ts`).
- **Pages.** `HomePage.tsx` became `LocationsPage.tsx`. New `InventoryPage.tsx`. `LowStockPage.tsx` removed.
- **Pins.** Pinned places moved to Locations.
- **Tap costs.** The story walk: J1 went from 4 taps to 3. J4, J5, J8 and J13 each cost one more tap, to reach the Locations tab or a filter.

### DEC-027: Every place in one list; move a place by picking it; bin quick view without delete; more categories

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin's notes from testing DEC-026:
- "Remove this bin" in the bin quick view didn't say whether it deleted the bin or only took it off the grid. It deleted it, behind a trash icon, in a view meant for a quick look.
- Places could only be browsed one level at a time, so there was no way to see every bin at once or filter by type.
- An empty bin's tile showed its ID, which only matters to the scanner.
- Moving a place needed a scan, and plenty of places have no sticker.
- He asked for more categories (batteries, resistors, capacitors and the like), and whether categories should have sub-categories.

Asked again (Q47), he kept the needs-details rule: a part needs a name **and** a category.

**Decision:**
- **Bin quick view.** It has no delete. Deleting stays on the bin's own page, with a confirm, as for any place.
- **Empty bins.** An empty bin's tile says "Empty" (its accessible name is "Bin 0003, empty"). The Stickers screen still shows IDs, since that's where they matter.
- **Locations.** A **By place / All places** switch.
  - **All places** lists every place whatever it's inside, in tree order. Each row shows what's in it and where it is.
  - **Type chips.** Bins, Racks, Gridded boxes, Totes and so on, each with a count. The chip that's on moves to the front.
  - **Find box.** It matches a place's name, the places it's inside, or what's in it.
  - With one site, the site itself is left out.
- **Moving a place.** It uses the same picker as moving a part: scan where it's going, or **Pick from list**.
  - The list opens beside where the place is now, marking it "here now".
  - The place being moved is hidden, so nothing can go inside itself.
  - A bin moved into another gridded box waits in that box's "not placed" tray, as before.
- **Categories.** Nine more starter categories, each with its own fields:

  | Category | Fields | Counted by |
  |----------|--------|------------|
  | Batteries | size, chemistry, voltage, capacity | count |
  | Resistors | resistance, tolerance, power, package | level |
  | Capacitors | capacitance, voltage, type, package | level |
  | Inductors | inductance, current, package | count |
  | Diodes | part number, type, package | level |
  | LEDs | color, size, package | level |
  | Transistors | part number, type, package | count |
  | ICs | part number, function, package | count |
  | Switches & buttons | type, rating, mounting | count |

  "Electronic components" stays as the catch-all. Migration 0009 adds them to an existing database, skipping a name that's already there, and a new database gets them from the seed.
- **No sub-categories for now.** Specific categories with their own fields already filter well and describe each part. A tree would add a step to every picker and filter. If the list grows long enough to need groups, `categories.parent_id` is already in the schema for one level.

**Rationale:**
- A quick view is for looking and small edits. A delete there, under a vague name, is a slip waiting to happen.
- Browsing one level at a time hides the bins, and the bins are where the parts are.
- Making a sticker a condition for moving something would block a real, common change.

**Consequences:**
- `GET /api/locations?all=1` (`listAllLocations`).
- `PickLocation` takes `exclude`.
- `BinSheet` lost its delete.
- `binLabel` returns "Empty".
- Migration `0009_more_categories.sql`, and `STARTER_CATEGORIES` extended.
- Taking a whole bin out to the bench or a project kit was still open here (Q48); DEC-028 settled it.

### DEC-028: A bin can be taken out of its box and keeps its spot

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin (Q48) |
| **Category** | UX / Data |

**Context:** Colin asked whether a whole bin could be checked out of a gridded box, say to a project kit. Moving it lost its grid spot, so putting it back meant arranging it again. He answered Q48: the spot should stay saved. He also asked that the grid show the bin as away (greyed out or textured) and say where it went. Then he added a case: if he decides to keep the bin out, he should be able to give up its spot and put a new bin there.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Move the bin into the kit, remembering its old box and spot | The kit holds it like any child | Two meanings for the grid columns; a bin with "just a note" has nowhere to be |
| **The bin stays its box's child, marked out (to a kit, or a note)** | The grid, overlap checks and paths keep working; the saved spot is simply its slot; out-with-a-note works | The kit lists its bins through a separate field |

**Decision:**
- **Taking out.** A bin can be taken out of its box, either to a project kit (one tap on the kit's name) or with a note ("on the bench").
  - It stays its box's child and keeps its slot, so the spot stays taken.
  - Placing another bin there says "That spot is saved for Bin 0001, which is out. Free its spot first".
- **The grid.** The tile is grey with diagonal stripes and says **Out** plus the kit's name or the note.
- **The bin's views.** Its quick view and page show "Out of Grid box 1 · In Weather station · 2 h ago", linking to the kit, with **Put it back in Grid box 1**.
- **Freeing the spot.** **Free its spot** (with a confirm) gives up the saved spot while the bin stays out. When it comes back, it waits under "Not placed".
- **The kit.** It lists "Bins taken out to this kit", each with Put back. Return everything and Finish project put them back too. A kit can't be deleted while a bin is out to it.
- **Parts in an out bin.** Their place line says "bin out: Weather station" in search and Inventory, and the part's page says "The bin is out: …".
- **Put-back mode.** Scanning a bin that's out puts it back in its spot, and the put-back screen says so.
- **Moving.** Moving an out bin to another place for good clears "out".
- **Activity.** It logs "Bin 0001 taken out to …" and "Bin 0001 put back". There's no Undo, because each of the two actions is the other's undo, one tap away.

**Rationale:**
- A bin that comes back goes in the same place nearly every time, so the spot should wait for it.
- Keeping the bin its box's child means none of the grid rules had to change. "Out" is three columns on top.

**Consequences:**
- **Data.** Migration 0010 adds `locations.out_at`, `out_to_id` and `out_note`.
- **Endpoints.** New `POST /api/locations/:id/take-out` and `/put-back`.
- **Types.** `LocationSummary.out`, `LocationDetail.outHere`, `Place.out` and `ProjectSummary.bins`.
- **Grid rule.** `PlacedBin.outName` is used for the saved-spot message.
- **Web.** New `TakeOut.tsx` (the form, the banner, and the put-back and free-spot actions).

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
| DEC-007 | When an item leaves "Needs details" | Product | Accepted (reconfirmed 2026-11-04) | 2026-11-02 |
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
| DEC-019 | Project kits are locations that are never a home | Product | Accepted | 2026-11-03 |
| DEC-020 | Bins are numbered, show their contents, and are dragged in from a palette | UX | Accepted (numbering superseded by DEC-023; sheet by DEC-024) | 2026-11-03 |
| DEC-021 | Camera scanning: our own decoder, one steady lens, and a labelling run | UX | Accepted (run superseded by DEC-022) | 2026-11-03 |
| DEC-022 | Stickers: tap a bin, aim, tap Scan | UX | Accepted (sheet camera superseded by DEC-024) | 2026-11-03 |
| DEC-023 | Bin IDs are global and fixed-width (Bin 0001) | Product | Accepted | 2026-11-03 |
| DEC-024 | Screens lead with what's there; sticker codes stay out of sight | UX | Accepted (pane scan changed by DEC-025) | 2026-11-03 |
| DEC-025 | A scan never changes anything without saying so; flow review fixes | UX | Accepted | 2026-11-03 |
| DEC-026 | Home is the inventory; Locations gets its own screen; Search is results only | UX | Accepted | 2026-11-04 |
| DEC-027 | Every place in one list; move a place by picking it; bin quick view without delete; more categories | UX | Accepted | 2026-11-04 |
| DEC-028 | A bin can be taken out of its box and keeps its spot | UX / Data | Accepted | 2026-11-04 |

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
