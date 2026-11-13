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
| **Status** | Accepted, tightened (confirmed by Colin 2026-11-03; 2026-11-04, Q47: a name alone isn't enough, a part needs its category too; enforced on every save from 2026-11-05, DEC-037) |
| **Deciders** | AI (during M2 build); confirmed by Colin |
| **Category** | Product |

**Context:** PRD open question: which fields are required before an item leaves the Needs details queue?

**Decision:** Quick-captured items are in the queue. An item leaves it the first time its details form is saved (a name is required there; nothing else). Items created with both a name and a category skip the queue.

**Rationale:** Required fields add friction, and friction is what killed the last attempt. Saving the form is a deliberate "I've looked at this" signal.

**Consequences:** Items can leave the queue with only a name. Easy to tighten later (e.g. require a category) without a data change.

**Update 2026-11-05 (DEC-037):** Q47 kept the stricter rule, but saving the form still let a part go with only a name. Now any save takes a part off the list only once it has a name **and** a category, and clearing the category puts it back. The form says so under the category box.

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
- **Scanning a bin on a kit's screen** (Q49, 2026-11-04). It offers **Take the whole bin** first, then "Or pull one part from it". If the bin is already in the kit, or out somewhere else, it says so. The kit's help line explains both.
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

### DEC-029: A screen that crashes shows a message, not a black page

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | AI (bug fix; Colin reported the bug) |
| **Category** | Architecture |

**Context:** On desktop, clicking from Inventory to any other tab turned the whole page black until a reload. The cause was the chip-row reset added in DEC-027, `useEffect(() => chips.current?.scrollTo(...))`. That returned whatever `scrollTo` returns. Newer browsers return a Promise there, and React called the Promise as the effect's clean-up when Inventory closed. It crashed, and with nothing to catch the error, the whole app unmounted. The test browser (Chrome 145) still returns nothing, so the checks missed it.

**Decision:**
- **The bug.** Both effects (Inventory, and All places on Locations) now use a block body and return nothing. A search for other effects returning a value found only real clean-up functions.
- **Safety net.** A `ScreenErrorBoundary` sits around each screen, just inside the shell. If a screen ever fails, while drawing or while closing, it says "This screen hit a problem", shows the error and offers Reload. The navigation stays, and the message clears when another screen opens.
- **Regression check.** `inventory-check.mjs` now runs a desktop pass where every scroll method returns a Promise, the way newer browsers do, and opens and closes every tab.

**Rationale:** An effect must return nothing or a clean-up function, so writing it with braces makes that impossible to get wrong. A black page with no way back is the worst way to fail. A message with Reload is the least that should happen.

**Consequences:** `src/web/components/ScreenErrorBoundary.tsx`, wired in `App.tsx`. The rule is noted in CLAUDE.md.

### DEC-030: Photos show as squares; the original is kept and the crop can be adjusted

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted (the "Adjust crop" button became "Crop" on the photo itself, DEC-031) |
| **Deciders** | AI recommendation on Colin's question (he asked whether to crop to square, and how) |
| **Category** | UX / Data |

**Context:** Before adding many parts, Colin asked whether photos should be square: with a square guide when taking one, a crop step when importing, or an automatic crop that can be fixed later. iPhone photos are 3:4 portrait (1200 × 1600 after the on-phone resize). Every list, tile and pane already showed a square by trimming the edges (`object-cover`), but the part's own page showed the whole photo at its natural shape. So that screen changed height with every photo, which is what Colin noticed.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Square guide while taking the photo | Framed right first time | Taking a photo opens the phone's own camera, which can't draw a guide; our own camera view would lose its focus, flash and quality, and doesn't help imported photos |
| A crop step after every photo | Always right | Slows down quick adding (J6, J9), the thing that has to stay fast |
| **Centre crop automatically, adjust later on the part's page** | No extra step when adding; one adjustment for camera and imported photos alike; most parts are photographed in the middle | A few photos crop awkwardly until adjusted |

**Decision:**
- **The original is kept whole.** It's shrunk to 1600 px on the phone, as before.
- **The thumbnail is square.** It's cut from the photo's centre (360 × 360) on the phone.
- **Every photo has a crop.** The square it shows as is stored as fractions of the original (`photos.crop_x`, `crop_y`, `crop_size`). None means centred and as big as fits.
- **The part's page shows a square.** It's at most 288 px, drawn from the full photo through the crop. Tapping it still opens the whole photo.
- **Adjust crop.** A button on the part's page opens an editor: drag the square, zoom with the slider, **Centre** to reset, **Save crop**.
  - The phone cuts a new square thumbnail and uploads it with the crop (`PUT /api/photos/:id/crop`).
  - Thumbnails are cached forever by name, so the new one gets a new name and the old file is deleted.
- **Existing photos.** They need nothing. They already display centred, and adjusting one gives it a square thumbnail.

**Rationale:** Keeping the original means no choice is final. A crop that's automatic but adjustable costs nothing when adding a part and fixes the rare bad one in a few seconds.

**Consequences:**
- **Data.** Migration 0011.
- **Code.** `lib/photo.ts` (`cropRect`, `squareJpeg`), new `CroppedPhoto.tsx` and `CropEditor.tsx`, `savePhotoCrop` in `api.ts`, and `Photo.crop` in the shared types.
- **Checks.** New `photo-check.mjs`.

### DEC-031: The part's page leads with its name; photos have a main one, a strip and a viewer

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin (feedback on the part's page) |
| **Category** | UX / Data |

**Context:** Colin found the part's page confusing. "Adjust crop" sat in a row of buttons away from the photo, and the name came after the photo. Added photos had no clear place or purpose:
- The oldest photo was always the one shown everywhere.
- Later photos appeared only as small thumbnails beside the Add photo button, and only once there were two.
- A better photo couldn't replace the first, and no photo could be deleted.

**Decision:**
- **Name first.** The name, category line, Pin and Edit, then the photo.
- **The photo.** It's a square, at most 288 px, with a **Crop** button on its corner. Tapping it opens the whole photo full screen.
- **The strip.** Under the photo: every photo, with a star on the main one, the one shown big outlined, and a "+" to add another.
  - With one photo, the strip has an "Add another photo" button and the line "Add more for another angle, the label or a pinout."
  - A newly added photo is shown big, so it's clear where it went.
- **Main photo.** It's the one shown in lists, tiles and the bin pane (`photos.is_main`, migration 0012; none marked means the oldest, as before).
  - **Use as main photo** shows under the strip when the photo shown isn't the main one.
- **The whole-photo viewer.** Solid black, previous and next, **Crop**, **Use as main photo**, and **Delete photo** (with a confirm). Deleting the main photo makes the next one main. The files go, but backups keep every photo ever taken.

**Rationale:** A page should say what it's about before anything else. Every photo action belongs next to the photo it acts on. And extra photos are only worth taking if you can see them, choose the best one, and get rid of a bad one.

**Consequences:**
- **Endpoints.** New `PUT /api/photos/:id/main` and `DELETE /api/photos/:id`.
- **Types.** `Photo.main`. Photos come main first, and thumbnails follow the main photo.
- **Web.** New `PartPhotos.tsx`, replacing the header photo code in `ItemPage.tsx`. Messages now sit above every overlay.

### DEC-032: Picking a place: tap a row to look inside, Choose to pick it; pin from Inventory

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin (feedback while moving a grid box, and on pinning) |
| **Category** | UX |

**Context:**
- **The place picker.** Each row in "Pick from list" did two things. Tapping the row picked it, and a small "3 >" on its edge opened it. The place something was already in was greyed out, so tapping it did nothing. Moving Grid box 1, Colin kept tapping "Garage (here now)" to get inside it, and nothing said the "3 >" was the way in.
- **Pinning.** A part could only be pinned or unpinned on its own page, not from Inventory, where pinned parts are shown.

**Decision:**
- **Picker rows** (every "Pick from list": moving a part, a unit or a place, check-out, a new place's parent, quick capture):
  - Tapping a row goes inside it, shown by a chevron.
  - A separate **Choose** button on each row picks it. A line says "Tap a place to look inside it."
  - The place it's in now says "(here now)" and has no Choose, but it still opens.
- **Inside a place.** "‹ back" sits above "Inside Rack B" and **Choose Rack B**, in the same outlined style as the row buttons.
- **Where the picker starts.** In the place that holds the thing, so its neighbours are one tap away. Something sitting right in a site starts inside that site. With one site and nothing to go by, it starts inside the site.
- **Pinning from Inventory.**
  - Every list row ends in a pin button: filled yellow when pinned, a faint outline when not. It replaces the row's arrow; the row still opens the part.
  - On tiles, the pin button sits on the photo's corner.
  - A pinned row on a phone puts its − / + on its own line, so the row keeps room for the full location and the pin button.

**Rationale:** One row, one gesture. A row's main tap now always does the same thing (go in), and picking is a visible, labelled button. Pins act on the list, so the list should be where they're set.

**Consequences:**
- `PickLocation`'s browser was rewritten.
- `InventoryPage` gained `PinToggle`, and its list and pinned rows were restructured (pin column instead of the arrow).
- The story walk's move step (J3a) now taps Choose and still costs 3 taps.

### DEC-033: Places have positions (rack slots); "add" means a plus, not a camera

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted for the icons; the typed positions were superseded by DEC-034 the same day |
| **Deciders** | Colin |
| **Category** | UX / Data |

**Context:**
- **Positions.** Colin's racks have numbered positions marked on them, and that number is how he tells which box is which. The app listed a rack's contents A to Z by name, with no way to record or order by position. Plain text sorting also put "10" before "2".
- **Icons.** "Add item" (and "Add item here", "Add a loose item", "An item (quick capture)", "Quick capture into…") used a camera icon, though adding a part doesn't need a photo. "Scan with camera" in put-back used a camera where the rest of the app uses the scan icon.

**Decision:**
- **A position on each place.** A short label such as "3", "A2" or "Top" (`locations.position`, migration 0013) says where it sits in the place it's in.
  - It's unique among its siblings, ignoring case.
  - It's cleared when the place moves to another parent.
  - Sites and bins on a box's grid don't have one; bins have grid slots instead.
- **Order.** Everywhere places are listed, those with a position come first, by position, with numbers read as numbers (2 before 10). The rest follow by name, also number-aware. One rule (`comparePlaces` in `src/shared/api.ts`) serves the server and the screens.
- **Shown everywhere.** A small tag with the position sits before the name in place lists, the place picker, All places, breadcrumbs and one-line paths.
  - Search results read "Grid-Box Rack › [3] Grid box 1 › Bin 0026", so the slot number is what you see first.
  - As plain text (the activity log), a step reads "3 · Grid box 1".
- **Setting them.**
  - **All at once.** **Positions** on a place's "Inside" list gives one box per place, with **Fill 1, 2, 3…** to start from. Two places at the same position are flagged before saving. It saves atomically (`PUT /api/locations/:id/positions`), so numbers can be swapped.
  - **One at a time.** The rename pencil on a place's page now edits its position next to its name.
- **Icons.** Adding a part uses a plus. Scanning uses the scan icon. The camera stays only where a photo is taken.

**Rationale:**
- The position marked on the rack is how Colin finds a box, so it should be how the app orders and shows boxes.
- A separate field from the name means moving boxes around the rack doesn't mean renaming them.

**Consequences:**
- **Types.** `Crumb.position` and `LocationSummary.position`. `LocationDetail.parentType` tells screens whether a position makes sense there.
- **New pieces.** `PositionTag` in `ui.tsx`, `crumbLabel` for plain text, and `PositionsEditor` in `LocationPage.tsx`.

### DEC-034: Racks have a size and numbered positions; drag to arrange

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted (supersedes DEC-033's typed positions; dropping now moves things along instead of swapping, DEC-035) |
| **Deciders** | Colin |
| **Category** | UX / Data |

**Context:** DEC-033 had Colin type a position into a box per place. He found that clunky. He wanted to drag the order, have positions numbered 1, 2, 3… by default with the option to rename them, and to set a rack's size and then pick what goes in each position.

**Decision:**
- **Size.** A rack or shelf can have a number of positions (`locations.rack_size`), labelled 1, 2, 3… Any position can be renamed ("Top", "A") (`rack_labels`; blank keeps the number, and each label is used once).
- **Places in positions.** A place inside sits in one position (`rack_slot`) or in "Not in a position".
- **Setting it up.** "Set them up" on a rack without positions, or "Numbered positions" when creating a rack or shelf. On first set-up, what's inside fills 1, 2, 3… in name order (Box 2 before Box 10).
- **The rack's page.** It lists the positions in order. A filled position opens its box. An empty one says "Empty · Put something here" and opens a sheet offering four ways to fill it:
  - Something already in the rack that's not in a position (one tap).
  - Scan a box's sticker.
  - "From somewhere else" (the place picker).
  - "New box here" (the new-place form, which then says "Goes in this position").
- **Arrange.**
  - **Size.** − and + change it. It can't shrink past a position in use.
  - **Labels.** Type over a position's number to rename it.
  - **Moving.** Drag a box by its handle onto another position; onto a taken one, the two swap. Drop it on "Not in a position" to take it out. The arrow keys on the handle move it one position.
  - **While dragging.** A label follows the finger ("Box 10 → 1"), the target is outlined, and the page scrolls near the edges.
- **Shown everywhere.** As in DEC-033, the position's label is a tag before the name in lists, paths and breadcrumbs. Lists put places in position order first, then the rest by name.
- **Your data.** Migration 0014 carried DEC-033's whole-number positions over: Colin's Grid box 1 to 3 went into positions 1 to 3 of a 3-position Grid-Box Rack. Migration 0015 dropped the typed position.

**Rationale:** The rack's own numbering is the layout. Like the gridded box, it's easier to set the shape once and move things within it than to type numbers onto things.

**Consequences:**
- **Endpoints.** `PUT /api/locations/:id/rack-size`, `/rack-labels` and `/rack-slot` (a drop that swaps). `rackSize` and `rackSlot` on create and `PATCH`.
- **Types.** `LocationSummary.rackSlot`, plus the label as `position`. `LocationDetail.rack`.
- **Shared rules.** `holdsPositions`, `rackLabel` and `comparePlaces` (by position).
- **Web.** New `RackView.tsx` (`RackSetup`, `RackView`, `LabelInput`, `FillSlot`). DEC-033's typed positions editor and rename field were removed.

### DEC-035: Dropping a box in a rack moves the others along, and you see them slide

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** With DEC-034, dropping a box on a taken position swapped the two. Colin wanted it to nudge everything between the old position and the new one by one instead, the way a list reorders. He also wanted the drag to show everything sliding into place, so it's clear what will happen.

**Decision:**
- **One rule for moving within a rack** (`rackMove` in `src/shared/rack.ts`). The server saves with it and the screen previews with it, so they can't disagree.
  - **Dropped on a taken position:** the box takes that position, and everything between its old and new position moves along one (empty positions in between move too).
  - **Dropped on an empty position:** it just goes there. Nothing else moves.
  - **Coming in from "Not in a position" onto a taken position:** the ones from there on move down into the next empty position. If there's none below, the ones above move up. A full rack says "Every position is in use. Add one first".
  - **Dropped on "Not in a position":** it leaves its position, which stays empty.
- **The list.** The positions are fixed rows of the same height, and the boxes are cards on top of them. A card slides (0.2 s) whenever its position changes: while dragging, after a drop, with the arrow keys, or when a save fails and things go back. Reduced-motion settings turn the sliding off.
- **While dragging:**
  - The box being dragged follows the finger, lifted and outlined.
  - The others slide to where they would end up. The target position is tinted, or turns red when there's no room.
  - A box coming in from "Not in a position" shows a label ("Box 9 → 2") while the rack opens a gap for it.
- **Saving.** The result shows at once and is then saved. If the server refuses, everything slides back.

**Rationale:** A rack is an ordered row. Moving one box should keep the others in the same order, not trade places with one. Seeing the result before letting go makes it obvious what a drop will do.

**Consequences:**
- `placeInRack` uses `rackMove`.
- `RackView`'s list was rebuilt as fixed rows plus sliding cards.
- New unit tests in `src/shared/rack.test.ts`.
- `pages-check.mjs` checks the slide, the order after each kind of drop, and the keyboard.

### DEC-036: Bin tiles show the part's photo, with a per-box switch back to names

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-04 |
| **Status** | Accepted |
| **Deciders** | Colin (Q50) |
| **Category** | UX / Data |

**Context:** Colin asked whether gridded-box tiles should show a bin's photo instead of its name, or a small thumbnail with the start of the name. On a phone a 1×1 tile is about 54 px, a 2×1 about 114 × 54, and a 1×1 on desktop about 76 px.
- **The photo alone.** Distinctive parts (modules, connectors, LEDs) are recognisable at 54 px, often faster than 8 clipped letters. Look-alikes (M3 × 10 and M3 × 12 screws) aren't.
- **Thumbnail plus name.** It doesn't fit on a phone's 1×1, but does on bigger tiles.
- **Bin colours.** The tile colours match the real bins and must not be lost under a photo.

**Decision:**
- **Which photo.** A bin's tile uses the main photo of the first part in it, A to Z, that has a photo (`LocationSummary.thumbUrl` and `thumbName`), framed by the bin's colour (3 px).
- **Layout by tile shape:**
  - **Square tiles** (1×1, 2×2): the photo fills the tile.
    - On big tiles (2×2, or any tile on desktop), the part's name runs along the bottom.
    - On a phone's 1×1 it's the photo alone, with "+N" when the bin holds more parts.
  - **Wide tiles** (a 2×1 lying down, the front strip): a square thumbnail beside two lines of name.
  - **Tall tiles** (a 2×1 standing up): the photo above the name.
  - The name shown is the part whose photo it is.
- **Unchanged.** Bins without a photo, bins that are out, and the Stickers screen show what they did before.
- **The switch.** "Tiles show: Photos / Names" under the grid, per box (`locations.tile_view`, migration 0016; default photos). It only appears when some bin in the box has a photo. A box of screws can show names while a box of modules shows photos.

**Rationale:** Photos identify parts by eye where text gets clipped. Keeping the bin's colour as a frame keeps the tile matched to the physical bin. A per-box switch handles look-alike parts without a global trade-off.

**Consequences:**
- **Data.** Migration 0016.
- **API.** `tileView` on `PATCH /api/locations/:id`.
- **Web.** `TileText` in `BoxGrid.tsx` lays out by tile shape.
- **Checks.** New `tiles-check.mjs`.

---

### DEC-037: Fill in details on one page; a category box you can type in; amounts in the details form

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-05 |
| **Status** | Accepted |
| **Deciders** | Colin (asked for the page and the type-to-search box); AI (layout and save rules) |
| **Category** | UX |

**Context:** Two notes from Colin:
- **The count in the edit form.** He asked why he could set the count there for an exact-count part but not for a plenty/low/out one. He couldn't set it for either. The number box under "Count" was the low-stock warning, so it looked like the count. The real amounts were only on the part's page.
- **One page for the Needs details list.** Filling in parts one at a time meant opening each part, then the form, saving, and going back (the review's "save and next" proposal). He asked for one page listing them all. Each row would have a small thumbnail, the name, a category dropdown you can type in to search, how it's counted and how many, plus a popup for more details.

**Decision:**
- **Fill in details page** (`/needs-details`). Reached from "Fill them in on one page" under Inventory's Needs details filter, and from the capture screen.
  - **Order.** Every part on the list, in the order they were added.
  - **Each row.** The thumbnail (tap for the full photo), the name, the category box, Exact count or Plenty / low / out, and how many in each place, with the place shown. The ⚙ button opens the full details form in a popup: full screen on a phone, a centred panel on a computer.
  - **Saving.** Each change saves straight away: the name on Enter or leaving the box, the rest on tap or pick. Amounts are logged with Undo, like anywhere else.
  - **Done rows.** A part with a name and a category gets a green tick and stays where it is until you leave, so rows don't jump. The heading counts what's left.
  - **Layout.** On a phone each part is a card. On a computer each part is one line, under the headings Name, Category, and "Keep track by, and how many".
- **Picking a category in a row** uses the category's usual way of counting (Fasteners count by level), unless you already picked it on that row or it would throw away a typed count. It also uses the category's usual type, unless the part has its own sticker.
- **The category box** (`CategoryPicker`), on the page and in the form.
  - **Finding one.** Typing narrows the list: names starting with the text first, then a word starting with it, then anywhere.
  - **Keys.** Arrows move, Enter picks, Tab takes the highlighted match, Escape puts it back.
  - **New categories.** A name that isn't there offers "Add 'X' as a new category".
- **The details form.**
  - "Count" is now "Keep track by".
  - A **How many** section shows each place's amount: a number, or Plenty / Low / Out. It converts on screen when you switch, and is saved with the form as recounts.
  - The number box is labelled **"Warn me when it's down to"**. For plenty/low/out parts the form says Low is their warning, which answers why there was no box.
- **Needs details rule** (DEC-007, Q47). Any save takes a part off the list only once it has a name and a category. Migration 0017 puts back parts that left with only a name; on the live data that's one part, "Angled male headers 40 x 1".

**Rationale:**
- Working through a list in place removes four steps a part, and typing "fast" beats scrolling 17 categories.
- Saving as you go fits short sessions on the couch.
- Keeping done rows still avoids tapping the wrong part as the list shifts.
- Putting the amounts in the form, labelled plainly, removes the confusion that prompted the question.

**Consequences:**
- **Data.** Migration 0017, data only.
- **API.** `GET /api/items/needs-details` returns every part on the list in full. `categoryId` is on every item summary. `PATCH /api/items/:id` works out `needs_details` from the name and category unless `needsDetails` is sent.
- **Web.** New `NeedsDetailsPage.tsx` and `CategoryPicker.tsx`. `ItemForm` is exported and works in a popup (`onClose`, `onDeleted`). `LevelButtons` is shared from `StockControl.tsx`. The bin pane's rename no longer forces "needs details".
- **Checks.** New `needs-check.mjs`. Story J14 now goes through the page.
- **Superseded proposal.** This replaces the review's "save and next" proposal.

---

### DEC-038: Where a part is, told as directions: the walk in lines, the box as a small map, the level in words

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted |
| **Deciders** | Colin (raised it, chose "level"); AI (layout) |
| **Category** | UX |

**Context:** Colin tried the main job, finding a part, and it fell down at the last step. The part page's Where card put the bin's number ("Bin 0035") in bold and the walk to it ("Garage › Grid-Box Rack › 3 · Grid box 3") in small grey above it. The number is how bins are told apart for stickers; nobody finds a bin by it. The useful part was the least prominent. The rack's position also read as a bare "3", and he wanted a picture of where in the box the bin sits, and maybe of the rack level too, as long as a big rack didn't make it tall. Q51: the word for a rack position is "level"; letting each rack choose its own word is left for later.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Reorder the text: the path bold, the number small | Cheap | Still a line of names to decode; the bin's spot is still not shown |
| Rename rack positions by hand ("Shelf 3") | Nothing to build | Every rack, by hand; the app knows what the number means |
| Draw it: the walk as lines, a map of the box with the bin lit, the rack level as a stack | Matches how you find things (walk, then look); the bin's number stops mattering | A component and one more request for the box; a big rack would need a tall drawing |

**Decision:**
- **The Where card reads as directions** (`WhereBlock` in `src/web/components/WhereMap.tsx`). One line per step of the walk, the biggest place first and each a link; with one site its name is left off (as in paths). The place you walk to, the box, is the bold line. Then, for a bin, the last step is drawn, not named:
  - **The box as a small map:** the real grid, every bin a faint grey outline, this bin the only one in colour (its real bin colour). Tapping it opens the box's page with that bin outlined (`/locations/:id?bin=<id>`).
  - **The spot in words** beside the map: "Red 1×1 bin, front row, 2nd from the left" (rows counted from the front strip, columns from the left; a front strip is just "Grey front strip"). This is also what the map says to a screen reader.
  - **The bin's number** last, small and grey, like a sticker code (DEC-024). On a bin's own page it's left out, since the heading is the number.
  - A bin that isn't on the grid says so; a bin in a place that isn't a gridded box gets just its colour and size.
- **Rack positions are levels.** A plain number reads as "level 3" everywhere a path is written out (`positionText`, used by `crumbLabel`, so "Grid-Box Rack › level 3 · Grid box 3" in lists and the activity log). A position Colin has named ("Top") reads as it is. The boxed number tag in lists stays.
- **The rack as a thin stack** beside its line: one short bar per level, the right one filled yellow, never taller than a line and a half. Past 16 levels the bars would be thinner than 2 px, so it gives way to words: "Big rack · level 7 of 25".
- **Paths carry what each step is.** Every `Crumb` from the server now has `type`, `rackSize` and `rackSlot`, so a screen can tell a bin from a tote and draw the rack without another request. The box map needs the box's children, so that is one `GET /api/locations/:id` (cached).

**Rationale:**
- Finding is walk-then-look: the lines say where to walk, the map says where to look. The bin's number is for stickers, so it goes last.
- Drawing the bin in its real colour on a greyed box needs no extra highlight, which also keeps yellow and blue bins readable.
- "level" is the word Colin uses; adding it in the app is one rule, where renaming would be one rack at a time.
- The stack stays small on purpose: a rack with 25 levels is better said than drawn at that size.

**Update 2026-11-06, later (Q53): drawn as a route.** Colin found the first version's lines and pictures read as unrelated pieces stacked up, and wanted the site kept. The block is now a route: one line down the left with a numbered stop for each place (site, rack, box…), each stop with the icon for its kind of place and its name, and under it what that kind has to show (a rack: "level 3 of 3" and the stack; a gridded box: the map). The last stop is the thing itself, a dot in the bin's colour with the spot in words and the number small; a bin that's out gets one more stop, "The bin is out: …". The box stays bold. On a bin's own page the route sits under the heading with a smaller map. Every step is the same shape, so new kinds of place slot in.

**Consequences:**
- **Web.** New `WhereMap.tsx` (`WhereBlock`, `BoxMap`, `RackMap`, `binWords`); the part page's place card and a bin's own page use it. The box page reads `?bin=` to outline a bin. `positionText` in `src/shared/api.ts`; the position tag's spoken label is now "level 3".
- **API.** `Crumb` gains `type`, `rackSize`, `rackSlot`. Activity text changes from "3 · Grid box 1" to "level 3 · Grid box 1" for new events.
- **Checks.** New `where-check.mjs`; `pages-check.mjs` reads the renamed position's new label.
- **Later, maybe.** A word per rack ("shelf", "drawer") if "level" turns out wrong somewhere; the same block in the bin sheet and on Inventory rows.

---

### DEC-039: The AI deploys to ubuntubot itself, after a backup

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted |
| **Deciders** | Colin (Q52) |
| **Category** | Process |

**Context:** Every change so far ended with "deploy with `docker compose up -d --build`" for Colin to run. Colin asked why. Nothing technical stops the AI: `colin` is in the `docker` group, so no password is needed. The habit came from the first sessions, when the Tailscale setup needed `sudo`, and from caution about the live data.

**Decision:** After a change is verified (tests and browser checks on a throwaway copy), committed and pushed, the AI takes a backup (`POST /api/backup`), rebuilds the container in `~/bin-there` on ubuntubot, and checks `/api/health`. The rebuild still runs the tests and refuses to ship if they fail. The AI reports that it's live.

**Consequences:** `AGENTS.md` and the handoff say so. Anything needing `sudo` (Tailscale, system packages) is still Colin's to run.

---

### DEC-040: A dev branch and a dev instance; the full checks gate `main`

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted |
| **Deciders** | Colin (proposed it; Q54: dev data is a copy of the live data) |
| **Category** | Process |

**Context:** Every change, however small, ended with the full browser suite (6 to 8 minutes) before it reached the app. Colin wants to iterate on visual changes faster, and proposed a dev branch with its own running instance, with the full suite run only when dev merges into main.

**Decision:**
- **Branches.** `dev` is where work happens; `main` is what's live. `main` only moves by a fast-forward merge from `dev`, after the full suite and the story walk pass.
- **Instances.** The live app stays as it is (`~/bin-there`, `main`, port 3000, backed up). A dev instance runs beside it: `~/bin-there-dev` on `dev`, container `bin-there-dev` on port 3001 (`compose.dev.yaml`, no backups), reached from the phone on port 8444 through Tailscale Serve.
- **Dev data** is a copy of the newest live backup (database and photos), refreshed by `scripts/dev-data-refresh.sh` when Colin asks. It only runs inside the dev checkout, so it can't touch the live data. Changes made in dev are throwaway.
- **Checks per change on dev:** typecheck, the unit tests, the one browser check for the screen touched, and a screenshot. **Before a merge to main:** everything.

**Rationale:** The live data and Colin's daily use stay safe behind the full gate, while a tweak to a screen takes a minute to see with real parts and photos.

**Consequences:** `AGENTS.md`, the handoff and `DEPLOY.md` describe both flows. The AI deploys to both (DEC-039). The one `sudo` step (Tailscale Serve on 8444) is Colin's.

---

### DEC-041: Quieter grid tiles: colour as the outline, a dark tint inside, names in one type, a veil for the unchosen

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin, 2026-11-06, after five rounds on dev) |
| **Deciders** | Colin (asked for a cleaner, less bold grid); AI (the style) |
| **Category** | UX |

**Context:** The box page's tiles were solid blocks of bin colour with bold text, photo tiles had three layouts depending on shape (framed square, thumbnail beside the name, thumbnail above it), the selection ring sat outside the tile with a black gap and ran over the neighbours, and the tiles' corners didn't nest in the box's. Colin found it bold and unpolished and asked for the colour to be just the outline with a dark inside, and for the styles to be unified.

**Decision:**
- **Colour is the outline.** Every tile is a 3 px outline in its bin colour round an inside that is a solid dark tint of the same colour (12% mixed into the surface, so nothing shows through; an empty red bin reads as a red bin with nothing in it), radius 6 px, always at full strength. An empty bin looks the same with a muted "Empty" (a dashed outline was tried and was the loudest thing on the page). A bin that's out keeps its grey stripes.
- **One text style.** 11 px medium in the text colour on every tile, whatever its size; no more white-on-red or black-on-yellow.
- **Photo tiles share one type, not one layout.** The square photo stays square (never stretched) and the rest of the tile is darker. The part's name (and "+N") is the same small white medium type everywhere, placed where each shape has room: in a translucent strip over a square tile, beside the photo on a wide tile, under it on a tall one. Similar, not identical: the shapes have different constraints, but the names never look as if they serve different purposes.
- **Two or more parts with photos** fill the tile's cells with one square photo each, A to Z (a wide tile two side by side, a 2×2 up to four, a front strip up to six). Each photo carries its own name strip, like a 1×1, so a name always sits on its picture (a run of names beside the photos read as one long name). Parts without a photo show as "+N" in the first spare cell, or on the last strip when there's none. The server sends `thumbs` (every part in the bin with a photo, up to six) for this; `thumbUrl`/`thumbName` stay as the first.
- **Selection** veils every other bin with a dark layer (not opacity, which let the cells behind show through) and rings the chosen one with 3 px in the text colour (white in dark mode); the bin the camera sees gets the same ring dashed, and one that's both gets it green. Blue and amber rings clashed with blue and yellow bins. The ring sits in the 3 px gutter between tiles (1.5 px round each), so the black between bins is exactly as thick as the ring, and it never covers a neighbour. Arriving from the route map on a desktop opens the bin's pane beside the grid as well as ringing it (on a phone the pane would hide the grid, so the ring waits for a tap). Closing the pane, or tapping the open bin again, deselects: no ring, every bin back at full strength, `?bin=` dropped from the address.
- **Corners nest:** the box is radius 8 px, the tiles 6 px sitting 1.5 px in; the faint empty cells match.
- The palette, the tray and the bin under the finger use the same tile.

**Consequences:** `BoxGrid.tsx` (`binOutline`, `binClass`, `TileText`, `ring`); `thumbsOf` in `locations.ts` and `LocationSummary.thumbs`. `binColors` in `ui.tsx` stays for the small solid bin chip and the route's map. `tiles-check.mjs` checks the outline and the one layout. The UI checks moved to port 3011, since 3001 is now the dev instance (DEC-040).

---

### DEC-042: Stickers by scanner: a "next up" panel and the choice moving on by itself

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin asked for it, Q55) |
| **Deciders** | Colin; AI (the scanner-mode layout) |
| **Category** | UX |

**Context:** Colin set up a new box and stickered its bins with the hardware scanner from the box page. Every scan brought up the bin pane's "New sticker scanned: put it on Bin 0042?" question, an extra click per bin. The Stickers screen (DEC-022) already puts a scan straight on a chosen bin, but it was built round the camera (a preview above the grid, a Scan button) and still needed a tap per bin to choose the next one.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| Scan while dragging bins in from the palette | One pass | Two hands on two things; bins without stickers are a normal state, stickers come later from a sheet |
| Skip the question in the bin pane | No extra click | A scan would write without the screen saying what it will do (against DEC-025) |
| The Stickers screen: choose once, then scan, scan, scan | One tap per box; the screen says which bin is next before each scan | The camera layout wastes the top of the screen when a scanner is in use |

**Decision:**
- **The choice moves on by itself.** After a sticker goes on, the next bin without a sticker is chosen, in reading order (left to right, top to bottom, the front strip last, then any not placed), wrapping round; with none left, nothing is chosen. The status line says "…is on Bin 0042. Next: Bin 0043". Works with the camera too.
- **Scanner mode.** A Camera / Scanner switch in the header, remembered. In scanner mode the camera is off and a **Next up** panel takes its place: "Scan the sticker for Bin 0042", with a line explaining the flow; the big Scan button becomes **Skip**, which moves the choice on without a sticker. The header counts "3 of 16 stickered".
- **A hardware scan with nothing chosen** switches to scanner mode and chooses the first bin without a sticker, saying "Bin 0042 is chosen: scan again to put X on it". It never writes on that first scan (DEC-025).
- The bins aren't veiled on this screen (DEC-041's veil), since the choice moves with every scan and the sticker codes on the other tiles need to stay readable.

**Consequences:** `StickersView.tsx` (`readingOrder`, `nextBare`, the mode switch, the panel); `BoxGrid` takes `veil`. `stickers-check.mjs` walks the scanner flow. The bin pane's question stays for scans that arrive elsewhere.

---

### DEC-043: A Settings screen: how the Stickers screen starts, the beep, appearance

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin asked for the switch) |
| **Deciders** | Colin; AI (where it lives) |
| **Category** | UX |

**Context:** With scanner mode on the Stickers screen (DEC-042), Colin asked for a switch somewhere to make it the default, or to turn the camera off altogether. The app had no settings screen; the only preference with a home was the theme picker at the bottom of Locations.

**Decision:** A **Settings** screen (`/settings`), reached from the sidebar on a desktop and from a link at the bottom of Locations on a phone (where the theme picker used to be). Everything on it is kept on the device, not the server:
- **Stickers screen starts with:** Camera, Scanner, or Scanner only. *(Replaced the same day by DEC-044's device-wide "Scanning on this device": Camera and scanner, Camera only, Scanner only, which every scanning screen follows.)*
- **Scan beep:** on or off (the same setting the Stickers header toggles).
- **Appearance:** device, dark or light (moved here from Locations).

**Consequences:** `src/web/settings.ts` (`getScanMethod`/`setScanMethod`), `SettingsPage.tsx`, a `Settings` item in the sidebar, the Locations footer link; `StickersView` reads the setting on open and hides its Camera/Scanner switch for "Scanner only". `stickers-check.mjs` covers all three settings.

---

### DEC-044: One scan language: a scan colour, a scan target on every screen that scans, and the bar as the status

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (on dev; Colin asked for the audit and chose magenta, Q56) |
| **Deciders** | Colin (the problem, the colour); AI (the language) |
| **Category** | UX |

**Context:** Moving a part offered "Scan with camera" or "Pick from list" and nothing said the hardware scanner would work, though it did. An audit found twelve places that listen for a scan; eleven of them only ever mentioned the camera, each in its own words, and on a device set to scanner-only the camera would still start from any of them. Colin asked for a universal scan language: a colour and an affordance that mean "a scan does something here", used everywhere, plus the camera never starting where scanning is set to the scanner.

**Decision:**
- **One setting for the device: "Scanning on this device"** (Settings, DEC-043, replacing the Stickers-only choice): Camera and scanner (default), Camera only, Scanner only. It decides what every scan button offers and whether the camera ever opens to scan. Scanner only: the camera never opens for scanning anywhere (`openCamera` refuses), the bar's camera button becomes a scanner status, and every target says to pull the trigger. Taking photos is a different use of the camera and is unaffected.
- **One colour: magenta** (`--color-scan`, `#f472b6`; `#be185d` in light mode), used for scanning and nothing else. It isn't a bin colour, a warning, success or "out". The flash on each scan is magenta too.
- **One component, `ScanTarget`:** a box outlined in the scan colour with the scan icon and one line saying what a scan does right now ("Scan where it's going", "Scan the sticker for Bin 0042"). Inside it: "Scan with camera" when the camera is allowed, "pull the scanner's trigger" when the scanner is expected, the other ways to do the same thing (Pick from list) and Cancel. A compact one-line form sits inside forms and panes. **A scan writes only where a scan target is showing** (DEC-025 made visible); anywhere else a scan opens what was scanned.
- **The bar is the status.** While a scan target is on screen, the phone bar shows a magenta strip with the same words and the round button turns magenta; the desktop sidebar's scan block does the same. Idle, it says "Scan with camera" (plus "or just scan with the scanner" when both) or, on scanner-only, "Scanner ready: scan a sticker to open it". So the same corner always says whether a scan will do something or just open something.
- **Every scanning screen uses it:** moving a part, adding a place, moving or checking out a stickered one, moving a place (`PickLocation`); the part page's new sticker; the place page's assign sticker; the new place form; quick add; put-back (ready, next, and "scan the bin it's going in"); the kit screen and its pull panel; the bin pane (only after its Set sticker / Replace sticker button is pressed: a scan here otherwise just opens what you scanned, so it wears no target, and an unused sticker scanned without the button still asks first); a rack position; and the Stickers screen's Next up panel. With both allowed the Stickers screen keeps its Camera/Scanner switch and remembers it.

**Consequences:** `settings.ts` (`useScanMethod`, `cameraAllowed`, `scannerExpected`), `scan/ScanTarget.tsx`, `useScanTarget` and `target` in `ScanProvider`, the `scan` Button variant, the token in `index.css`. Checks: `stickers-check.mjs` covers the setting's three values and the bar; the other checks keep their "Pick from list" and "Scan with camera" steps.

---

### DEC-045: The name is written "Bin→There", with the arrow

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin, Q57) |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** Colin wanted the name shown as "Bin->There" in the app, the code and the repo. A `>` can't be in a GitHub repository name (it would become `bin--there`) and is the shell's redirect character, so it has no place in a folder, package or container name. The display name is the only thing that needs it.

**Decision:** Everywhere people read the name (the sidebar, the browser tab, the home-screen icon, the docs) it is **Bin→There**, with the real arrow glyph rather than `->`, which reads as code and lines up badly on iOS. The code slug stays `bin-there` (repo, folders, package, container, backups; DEC-011).

**Consequences:** `App.tsx`, `index.html`, `manifest.webmanifest`, the docs' headings. Phones that already have the icon keep the old label until it's re-added.

---

### DEC-046: Screens update themselves when another device changes something

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin, Q58) |
| **Deciders** | Colin |
| **Category** | UX / Architecture |

**Context:** Colin switches between the desktop and the phone. A screen left open kept showing what it loaded until he did something on that device, because the app never refetched on its own (window-focus refetching was off and nothing told open screens that the data had changed).

**Decision:** Two layers, both on. **(1)** Coming back to a tab, or getting the network back, refetches whatever is on screen (TanStack Query's focus and reconnect refetching, now on). **(2)** The server streams a tiny "something changed" ping over server-sent events at `GET /api/changes`: every write that succeeds bumps a version number and the ping carries it, with the writer's per-tab id (`X-Client` header on every write). Each open screen holds one stream and refetches all its queries when the version moves, ignoring its own echo because it already refreshed itself after the write. The first message after a (re)connect says where the server is now, so a phone that slept through changes catches up when the browser reconnects the stream. A comment every 25 s keeps proxies from closing a quiet stream. Backups don't count as a change.

**Consequences:** `src/server/changes.ts`, the `/changes` route and the bump middleware in `app.ts`, `src/web/live.ts` (`useLiveUpdates`, `clientId`), the `X-Client` header in `api.ts`, `main.tsx` defaults; `scripts/ui-checks/live-check.mjs` (two browser contexts as two devices). Through Tailscale Serve and the container the stream is plain HTTP, no extra ports. No polling: a quiet app costs one idle connection per open tab.

---

### DEC-047: Three small reaches: the count under the name, Move in the bin pane, a box's grid size

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin, Q59) |
| **Deciders** | Colin |
| **Category** | UX / Data |

**Context:** Three things the story walk and the flow review kept flagging. On a phone the part page's count sat below the photo and the route, out of reach without scrolling. The bin pane had no way to move a part out of the bin. And a gridded box was always the Allit case's 6 × 4: nothing let you say otherwise, on the form or later.

**Decision:** **(1)** The part page shows one count row per place it's in, right under the name and type and above the photos: "In Bin 0001 − 40 +" (or Plenty / Low / Out). The Where card keeps the route, Home and Move, without a second copy of the count. **(2)** Every part in the bin pane has a Move: it opens the same "scan where it's going, or pick from the list" as the part page, with the list opening beside this bin, and a "How many?" box when there's more than one. **(3)** A gridded box has a grid size: cells across × rows down (1 to 12 × 1 to 8), not counting the front strip; 6 × 4 unless changed. The form asks for it, and the box's page shows it with Change size. The server refuses a size a placed bin wouldn't fit in, naming the bin, and counts bins that are out (their spot is saved). The front strip follows the new front row.

**Consequences:** `ItemPage.tsx` (`Header`, `PlaceCard`), `BinSheet.tsx` (`MovePart`, Move buttons), `LocationFormPage.tsx`, `LocationPage.tsx`, `gridSchema` and `grid` on create/update in `src/shared/api.ts`, `createLocation`/`updateLocation` in `locations.ts`; `fill-check.mjs`, `pages-check.mjs`, server tests. The walk's "Use one visible without scrolling" and "pane has a way to move the part" notes read true now.

---

### DEC-048: AI data fill, as an experiment on the `ai` branch: a local model reads the photos and looks the part up, and suggests details

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted as an experiment (Colin, Q59); not on `main` |
| **Deciders** | Colin |
| **Category** | Product / Architecture |

**Context:** Filling in a part's details by hand is the slow part of the inventory, and Colin doesn't want to have to type a long part number first: the app should work out what the part is from what it already has, the name, the category, the notes and above all the photos. The PRD's open question was local model or paid API, against the $0 running cost rule. The server has a GTX 1080 Ti with about 5.5 GB free, Ollama already installed (though its system service runs CPU-only), the Docker GPU runtime (Frigate uses it), and a SearXNG meta-search already running on port 8989.

**Decision:** Build it on a separate `ai` branch with its own checkout (`~/bin-there-ai`), its own instance (`compose.ai.yaml`, port 3002, throwaway data) and its own Ollama container on the GPU (models in a named volume, port 11435), so `main` and `dev` are untouched and nothing costs money or leaves the house except the web searches. One small local model does both the looking and the reading: `gemma3:4b` (vision-capable, 3.4 GB) by default, set by `AI_MODEL`. The feature is off unless `AI_URL` is set; `SEARCH_URL` points at SearXNG.

The pipeline is three steps on the server (`src/server/ai/`): **look** (the photos and what's known go to the model: read every printed marking exactly, say what it likely is, propose two or three searches), **search** (SearXNG, stopping once there's enough; suppliers' and makers' pages first; up to four pages boiled down to text), **extract** (the model fills the category's fields, supplier, part number, price and link from the pages and markings, each with its source and a confidence). Rules that the code enforces, not just the prompt: a price only ever from a page that was read; a link from the photo only if it's printed on the part; a category only from the list; a field that isn't one of the part's fields is dropped; a suggestion naming a page that wasn't read is pointed at one that was. **Nothing is written by the AI.** The details form gets a "Suggest details with AI" button; suggestions show with "sure / likely / a guess" and a link to where each came from; Use (or Use all) puts them in the form; saving records them in `items.ai_fields` with the source and time (migration 0018). The part's page marks those details "AI" with the page they came from, and typing over one by hand drops the mark.

**What the first real runs showed (2026-11-06, four of Colin's parts, checked against the photos by eye):** reading the photos is fast, about 10 s a part on the GPU, and it reads what is actually printed: the NeoPixel bag's label came back word for word ("NeoPixel Diffused", "5mm LED x5", "http://adafru.it/1938", the lot code and date), and the stacking-headers bag's label came back with one digit wrong ("adafru.it/11112" for 1112). But the first version let the model see what was already on record while it looked at the photo, and it echoed the Kycon connector's known part number back as a "marking" from a bag that has no text on it at all; and for a bare JST pigtail with nothing printed it invented "PH-08". So: the look step now gets the photos alone, with the record kept for the extract step; a part number or link "from the photo" must be in the markings or it's dropped; an unprinted brand or name is at best "likely"; a price only ever comes from a page. A web address printed on the bag is fetched directly (no search engine needed) and settles supplier, product number and link, so Adafruit and SparkFun bags work even when the search is down. The web search itself failed on every run: SearXNG's engines were all suspended or asking for CAPTCHAs after twelve queries in forty seconds, which is why queries stop early and the result says plainly when the search didn't answer. Honest expectations: labelled bags (Adafruit, SparkFun, supplier labels) will be read well; a part with nothing printed yields a type and a brand guess, not a number; one-digit misreads happen; resistor and capacitor codes are not readable by this model; prices and specs depend on the search working.

**Gemma 3 4B against Qwen3-VL 4B (2026-11-06, same four parts, same photos):** Qwen read the stacking-headers label right ("adafru.it/1112", where Gemma read 11112) and then fetched the real Adafruit page; but it read nothing at all off the NeoPixel bag that Gemma read word for word, it called the unmarked Kycon bag an electrolytic capacitor, and it took 2 to 2.5 minutes a part against Gemma's 10 s (its "thinking" is now switched off for Qwen 3 models, untested at the time of writing). Neither is clearly better at 4B; Gemma stays the default, `AI_MODEL` switches. The real step up is likely the 8B Qwen3-VL, which needs the 5 GB that the idle `neutts` container holds.

**Consequences:** `src/server/ai/{ollama,search,research}.ts` (pipeline with injectable pieces, unit-tested with fakes), `GET /api/ai/status`, `POST /api/items/:id/research`, `aiFields` on `PATCH /api/items/:id`, `AiSuggestions.tsx`, marks in `ItemPage.tsx`, `ai-check.mjs` (a fake model and search in the check itself), `compose.ai.yaml`. Follow-ups if it earns its keep: a sparkle on each Fill in details row, running it for every part on the list in one go, and SearXNG engines that block less (its settings are Colin's, outside this repo).

---

### DEC-049: The AI reads the shop's own page first: the link on record, or the page for the supplier and part number; Mouser and Digi-Key through their APIs

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-06 |
| **Status** | Accepted (Colin, Q61); on the `ai` branch with DEC-048 |
| **Deciders** | Colin |
| **Category** | Product / Architecture |

**Context:** Colin asked whether, instead of the AI guessing from photos and a web search, he could just supply the purchasing link and have it get the details from that, or from a few specific sources, and said he didn't want the feature unless every shop he buys from could be covered. His shops are Mouser, Digi-Key, Amazon, Adafruit, SparkFun and LCSC. Tested from ubuntubot on the home connection: Amazon, Adafruit, SparkFun and LCSC serve their product pages to a plain fetch (title, prices and specifications readable). Digi-Key answers a plain fetch with a Cloudflare bot check and Mouser refuses outright; both offer free official APIs for exactly this (a key from mouser.com/api-hub; an app at developer.digikey.com for the Product Information API v4). A headless browser on the server would have got Digi-Key's page, but that is building around a bot check the shop put there on purpose; the APIs are the intended door and give cleaner data (price breaks, a parameter table, the datasheet). SearXNG's search engines were suspended through the whole session, which made the point: the web search is the fragile part, and reading one known page is the reliable part.

**Decision:** The look-up reads the part's own page first and searches only when it can't. In order: the **link on record** (the owner's own), the **shop page built from the supplier and part number on record** when the shop is one of the six (`src/server/ai/shops.ts`: Adafruit `product/N`, SparkFun `products/N`, LCSC `product-detail/C….html`, Amazon `dp/ASIN`; Digi-Key and Mouser by part number through their API), then a **web address printed on the part** (DEC-048). If any of those is read, the web search is skipped; if none is, the search runs as before. A link to one of the six shops names the product, and that settles the supplier and its product number without asking the model. Mouser and Digi-Key links are read through their APIs (`mouser.ts`, `digikey.ts`), on when `MOUSER_API_KEY` and `DIGIKEY_CLIENT_ID` + `DIGIKEY_CLIENT_SECRET` are set (in a `.env` beside `compose.ai.yaml`; `GET /api/ai/status` reports `shops.mouser` and `shops.digikey`); without a key, the result says plainly that the shop can only be read through its API and no key is set, and the search takes over. The page the owner saved is told to the model as "the owner's page for this exact part", so what it says is rated sure; what's already on record (name, supplier, number, link, a filled field) is never suggested back. Page text drops menus, headers and footers so the part itself fits in what the model reads.

**What the real run showed (2026-11-06, the :3002 instance, `gemma3:4b`):** with a link on record each part took 6 to 11 s and came back with supplier, product number, name, category and price from the page: the NeoPixel bag's Adafruit link (name "NeoPixel Diffused 5mm PTH LED (x5)", LEDs, $4.95), an LCSC link (10 kΩ resistor, Resistors, C25804), a SparkFun supplier + number (Pocket Screwdriver Set, Tools, $5.50, and the page as the link), an Amazon link (Raspberry Pi 4 Model B 4GB, B07TC2BK1X). A Mouser link without a key said so and fell back. Three things the run exposed and the code now enforces: the model's answer is capped (`num_predict`), because one answer ran on for 6,000 tokens until the context was full and nothing was kept (100 s for nothing); a price "from a page" has to appear on that page, because the model offered $0.35 for the LCSC resistor whose page shows no price at all; and an Amazon price is only ever "likely", because Amazon's page lists neighbouring products' prices first and the model took the 1 GB model's $96 for the 4 GB one. Also: the model names its source loosely ("the owner's page", "Page 1", "photo" with no photo), so those are resolved to the page they mean rather than thrown away; with no photo and no page, only a category guessed from the name is offered; and the model's notes are dropped when there is nothing behind them.

**Digi-Key verified (2026-11-08):** Colin's first key belonged to a sandbox app (Digi-Key's real server said "Invalid clientId", its sandbox gave a token but refused product lookups); a production app with Product Information V4 fixed that, and the API answers in under two seconds with the shapes the code expected. The first real run exposed two bugs, both fixed: a Digi-Key **detail link** carries the maker's number ("1938"), which the keyword search matched against thousands of parts and took the first (a Molex socket for an Adafruit LED), so now only an exact match whose maker is the one in the link counts, and none means no page rather than the wrong one; and the **supplier + part number** route built a Digi-Key search link, then re-read the link and lost the number, so the reader had nothing to ask for; the built link now keeps what it was built from, and a pasted Digi-Key search link (`…/products/result?keywords=`) is understood too. Also learned: Ollama had silently fallen back to the CPU (the container lost the GPU after a day: `docker exec bin-there-ollama nvidia-smi -L` says "Failed to initialize NVML"), which made every answer ten times slower; restarting that container brings the GPU back. It happened again that evening, right after systemd reloaded (a package update): a known Docker and NVIDIA fault where a container loses the card's device files on a reload. `compose.dev.yaml` now names those device files for the Ollama container, the documented cure; not yet proven through a real reload. Also fixed the same day: the look-up read the link *saved* on the part, so a link pasted into the form and not yet saved was ignored; the form now sends its current name, link, supplier and part number with the request and those are what's read.

**Colin's first real part (2026-11-09, a Mouser link for a Kycon power plug):** the screen said "It looks like: Relay … nothing it was sure enough about to suggest", although Mouser's page had been read correctly. The model's answer had run into the length cap and stopped mid-way, the cut-off JSON didn't parse, and the whole answer was thrown away, leaving the photo's wrong guess as the part. Four changes: a cut-off answer keeps every suggestion it finished and says it was cut short; the model names its sources as "page 1" or "photo" (enforced by the answer's schema) instead of writing a long shop address out for every suggestion, which was most of the answer's length; the Mouser and Digi-Key pages give only the single-unit price, because with the whole price ladder the model once took the 50-off price; and any known shop's page that was read settles the supplier as the shop's short name ("Mouser", not "Mouser Electronics") with the shop's own number from its API, even when the link carries the maker's number.

**One supplier, one price (Q72, 2026-11-10):** asked whether a part should hold several suppliers or price points, Colin chose to keep it simple. A part's supplier, part number and price answer "where did this come from and how do I get more"; which shop is cheapest today is the shops' own job, and a second stored price is mostly a stale number a year on. No "bought on" date either. In step with that, the look-up now reads only the first direct page it can (the link on record, else the page for the number on record, else a printed label) rather than two pages that might be two products.

**Consequences:** With a link pasted in, the look-up needs no search engine and no photo and takes one page read plus one model call: the common case is fast and sure. The cost is two keys Colin registers for once. An Amazon price wants a glance before Use; LCSC shows prices only by script, so none comes from it; LCSC links must be the product page (its search page is scripts). The web search and the photo reading stay as the fallback for a part with no link and nothing on record. Honest limit: no website is guaranteed readable forever; the six are covered today by plain pages or official APIs, and anything else that refuses says so instead of guessing. Not built: reading a page shared from the phone's own browser (the universal path when a site refuses the server); worth it if a seventh shop appears.

### DEC-050: Two folders on the server, production and development; no folder per branch

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-07 |
| **Status** | Accepted (Colin, Q65) |
| **Deciders** | Colin |
| **Category** | Process |

**Context:** The AI experiment got a third checkout (`~/bin-there-ai`, a git worktree of the dev clone) because the live app's folder can only have one branch checked out and the dev folder was busy with `dev`. Colin asked why a separate folder rather than a branch, and then: "let's make a production folder rather than making a bunch of random development folders". The folders had grown by accretion: `~/bin-there` (live, `main`), `~/bin-there-dev` (`dev`), `~/bin-there-ai` (`ai`), each with its own container.

**Decision:** Two folders and no others. **`~/bin-there-prod`** is production: only ever `main`, the live container `bin-there` on port 3000, the real data and backups; it is only ever touched to deploy. **`~/bin-there`** is development: one checkout where branches are switched freely (`dev`, an experiment branch, whatever is being worked on); the dev instance runs from it on port 3001 (`compose.dev.yaml`), which now also carries the AI data fill's Ollama container and shop API keys, so an experiment branch needs no instance of its own: switch to it and rebuild the dev instance. The `ai` branch was merged into `dev` (a fast-forward; the feature stays off on any instance without `AI_URL`), `compose.ai.yaml` and the ai folder and container are gone, and the downloaded model's volume is reused by name. Done 2026-11-07 after a backup: the live container was stopped, the folder renamed, the container started again from the new path (same image, same data, same port, so Tailscale and the phone saw a minute's outage and nothing else), then the dev folder renamed to `~/bin-there`.

**Consequences:** One rule to remember: edit in `~/bin-there`, deploy from `~/bin-there-prod`. The compose project for production is now named after its folder (`bin-there-prod`), which changes nothing for the container or its name. The dev data refresh script's guard now checks for the `~/bin-there` folder. Anyone opening `~/bin-there` in an editor is in the development folder, which is what they want. The old port 8445 Tailscale mapping (the ai instance) is dead and can be turned off; 8444 still reaches the dev instance.

### DEC-051: The details form in two columns when it has the room; the desktop audit

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-10 |
| **Status** | Accepted (Colin) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin, using the app on a computer, said the edit item page looked formatted for a phone, and asked for an audit of every other screen for the same. Screenshots of all nineteen screens at 1440 px wide (from a copy of the dev data) showed sixteen already laid out for the width: Inventory as a table, the part's page with Where and History beside the photo, the rack and box pages with the contents beside the grid, Fill in details as columns, Put-back in two columns, the lists and Settings centred. Three were a phone column on a wide screen: the **details form** (`/items/:id/edit`, a 672 px column 1,374 px tall, scrolling to reach Save), **Quick capture** (a 500 px photo square and the fields under it in one column) and a **bin's page** (route and items stacked on the left, the right half empty).

**Decision:** The details form lays itself out by its own width, not the window's (a CSS container query), so the same rule serves the page and the Fill in details popup: with 48 rem or more, two columns, what the part is on the left (name, category, type, how it's counted, how much there is, the warning number) and its details on the right (the category's fields, other fields, price and supplier, part number, link, notes), with Save and Cancel beside the title; narrower, the one column with Save at the bottom as before. The popup on a desktop widens from 42 to 60 rem so it gets the two columns too. The AI block stays full width above both columns, since its suggestions land in either. Quick capture and the bin's page are noted, not yet changed.

**Consequences:** The whole form fits one desktop screen with nothing to scroll; the phone layout is unchanged (the browser checks for Fill in details and the AI block pass as before, with the popup's new width). Next, if Colin wants them: Quick capture with the photo square beside the fields, and the bin's page with its route on the left and its items on the right, like the part's page.

### DEC-052: Print stickers from the app: die-cut sheets as PDF, Cricut Print Then Cut as PNG

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-11 |
| **Status** | Accepted (Colin, Q74) |
| **Deciders** | Colin |
| **Category** | Product / UX |

**Context:** Colin prints his QR stickers with a script of his own (`qr-label-creator` on GitHub: SVG for die-cut label sheets, a transparent PNG for Cricut Print Then Cut) and wanted that inside the app. He asked whether the Cricut's Design Space software could be avoided: it can't for full sticker vinyl, since Design Space is the only software that drives a Maker 3 and it prints the registration marks the cutter reads. Pre-cut waterproof sheets would avoid the Cricut altogether, but he prefers his vinyl, so both ways are wanted (Q74).

**Decision:** A **Print stickers** screen (`/stickers/print`, reached from the bottom of Locations). Print on: *Sticker vinyl, Cricut* (the default) or *Die-cut sheet*; the label size from one of the script's four templates (the measurements carried over to the point because they were tuned on real prints, but two names put right: the script's "SL855" is SheetLabels' **SL588**, 1.375" × 0.5625", 80 up, which their own page confirms and which is the size Colin cuts on his vinyl, so it's first; the script's "SL588", 1.75" × 0.5", 76 up, was its Paperless-ngx sheet, not SL588, and Colin said it can go, so the app has three: SL588, Avery 6570 and MR183); for the Cricut, the **cut rectangle** typed in. Cricut's page "How large can I Print Then Cut" (pasted by Colin, edited 2026-08-19) gives 7.44 in across by 9.94 in tall on a Maker with Letter paper, with the corners reserved for the sensor marks. The first idea was to use that whole notched outline and leave out the corner labels; **Design Space refused it**: it measures an uploaded bitmap's whole rectangle, clear corners and all (its "max size for this shape" of 6.76 × 9.04 in for the 7.44 × 9.94 image is that rectangle shrunk to the narrow middle), which cost Colin a wasted test print. The next idea, the full 7.44 in width across the band between the top and bottom marks (5 × 14 = 70), failed the same way: for a 7.25 × 9.09 in image Design Space again offered 6.76 wide, so **a sheet-sized image is capped at 6.76 in wide whatever its height**, and Cricut's 7.44 is only for a short wide shape; that cost a second print. Then a 5.875 × 9.752 in image was capped at 9.26 tall: **the box Design Space allows one image is 6.76 × 9.26 in**, which is what Colin measured on the first day, and Cricut's 7.44 and 9.94 are the widest and tallest points of the notched outline, reachable only by short or narrow shapes. That is the default now, with the box still a setting for another machine or paper (Design Space's warning gives the number). As many labels as fit are laid out with the gap spread evenly (at least a sixteenth, at most an eighth of an inch), giving **4 × 14 = 56 SL588 a sheet upright, the old way, or 10 × 6 = 60 turned**. Colin asked whether vectors would do better, since shapes drawn in Design Space itself fill the notched outline: they do because Design Space checks each shape on its own and places them within the outline on the mat. That would mean one Print Then Cut image per sticker, and Design Space's Flatten merges whatever is selected into one image, so a 60-sticker SVG would be 60 flattens by hand, and 60 PNGs 60 uploads and sizings; the gain would be the five-column band across the middle, about eight stickers. Not worth it; noted here in case Design Space ever flattens groups one by one. The image is just the labels with no clear border, 5.875 × 9.075 in for SL588 upright: Design Space trims a transparent border off an upload before measuring it, so a bordered image came out a different shape when sized with the ratio locked; the screen gives the size to the thousandth, width typed and the height following; and a choice, **upright** (as Colin has always cut them, the default) or **turned a quarter turn when that fits more** (60 turned against 56 upright in the 9.26 in box; the same sticker once peeled; Colin's first reaction to a turned sheet was that it made no sense, hence the choice and upright as the default; the cable flag printed twice down its length stays upright either way). The PNG is 600 dpi: at 300, Design Space warned of low resolution. The notch logic stays in the layout code (off) in case a later Design Space measures the shape; title and subtitle ("Bin→There" and "Inventory tag" to start; the PDF draws the arrow with the built-in Symbol font, since Helvetica has none; a smaller arrow was tried and Colin wants it at the font's own size); the Design Space steps shown after a Make name the material Colin found right for his 0.08 mm vinyl, "Printable Vinyl (Grey liner printing)" with Less pressure (the default went through the liner in spots). **The first real sheet cut well (Colin, 2026-11-11).** and their colours (remembered on the device); sheets; on a die-cut sheet, how many used labels to skip and an outlines-only test print. A live preview with sample codes. *Make* draws fresh random codes (12 characters from the lookalike-free alphabet every sticker so far has used), asks the server which are already on something (`POST /api/stickers/check`, swapping any that are), and downloads a PDF (one page per sheet, pdf-lib's built-in Helvetica, printed at 100%) or a PNG per sheet (300 dpi, transparent, white label shapes, drawn on a canvas in the browser) with the exact size to type into Design Space and the three steps there. The codes are **not recorded**: a sticker becomes something the first time it's scanned onto a bin or a part, the rule the whole app runs on. All of it runs in the browser, so the server image gains no image library; the server's only part is the check.

**Consequences:** `src/shared/labels.ts` is the port: templates, the Cricut re-grid, codes, and one layout that turns a page into plain rectangles and text in page coordinates, which the SVG (preview, PNG) and the PDF both draw without any transforms of their own; its tests pin the template numbers and that every label's drawing stays inside its label, turned or not. Two new dependencies, `qrcode` and `pdf-lib`. The browser check makes both files and scans the PNG's codes back with the app's own decoder. **Design Space accepted the 5.875 × 9.075 in image with no warning (Colin, 2026-11-11)**, after three refusals on the way (above). Not yet: reprinting a particular sticker (the script's `--ids-file`); and the cut itself on the Maker 3 is Colin's to report.

### DEC-053: AI data fill, round two: part numbers read off the part go to the shops, quick naming for plain things, the datasheet read

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-11 |
| **Status** | Accepted (Colin, Q91); the three steps built |
| **Deciders** | Colin |
| **Category** | Product / Architecture |

**Context:** With everything shipped, Colin held the AI back from the live app: a pasted link works well, but the feature "could use a little more" to be worth hosting the model. He asked for ideas; the weak leg all along has been the web search (SearXNG's engines refusing, and the model guessing which hit is the part), and the photo step reads printed numbers well but had nowhere sure to send them. Five ideas were laid out; Colin chose three to build now, then a bigger model to try, then capture-time reading later.

**Decision:** Three steps, in order. **(1) A number read off the part is looked up at the shops.** After the photo step, and only when no page was read from a link or the record, anything on the part that looks like a part number (letters and digits together, or a dashed all-digit number; not a date or a web address; longest first, at most four) is tried at Mouser's and then Digi-Key's own search through their APIs. Only an exact match on the maker's number or the shop's own counts (Mouser's reader no longer settles for its first result either), the first find is the page, and it settles supplier, number and link as "likely" rather than "sure", with a note saying which number it was found by. Only if that finds nothing does the web search run. **(2) Quick naming for plain things**: a photo-only pass, no reading and no search, offering a name and category as "likely" for the things with nothing to look up (a hammer, zip ties), run over the whole Needs details list with a suggestion per row to accept with a tap. **(3) The datasheet**: when a shop page names one, its first pages are read too, for the category's fields (voltage, package) the shop page often lacks. Then, as experiments: the 12B model for the photo step (the 4B one called a power plug a relay), and later reading the label at capture time.

**Consequences:** The two shop APIs become the search engine for most of what Colin owns, and the flaky web search is the fallback only. All three steps built on 2026-11-11, each tested with fakes: (1) which numbers are tried, in what order, that nothing is searched when one is found, that a near miss is no page, and on the dev data a seven-segment display's printed "MAN3620A" was found at Mouser in four seconds; (2) quick naming is one model call, three to six seconds a part on the card, and over eight unnamed dev parts gave names like "JST PH 3-pin cable", "8-pin header strip" and "RadioShack 276-0145 Phototransistor" with the right categories; the Needs details list has a "Suggest names with AI" button that runs it row by row, with Use and Dismiss under each; (3) the datasheet is fetched only when a shop page names one and the category has fields, read with pdf.js (first three pages, 15 MB cap, 5,000 characters kept), labelled "the part's datasheet" for the model, and a price claimed from it is dropped as from any page that doesn't show one. New dependency `pdfjs-dist`. Found on the way: at boot Docker starts the Ollama container before the card's driver is up and it runs on the CPU all day, so `compose.dev.yaml` now has it wait for the card. **The 12B model, tried 2026-11-12** (Colin stopped the `neutts` container to free the card; `gemma3:12b` is 8.2 GB and takes 8.1 GB of the 11 GB card): on nine unnamed dev parts, quick naming took 7 to 10 s a part against 3 to 6 for the 4B, and the full lookup on the Kycon plug 21 s against 30. Judged against the photos: the 12B got a 2-pin JST cable's pin count right where the 4B said three, filed a phototransistor under Transistors rather than the catch-all, named the Kycon plug from the Mouser page ("DC Power Connector 4P") where the 4B blended in its "JST" guess and invented a "Gauge" of "PH 3", and its answers weren't cut short. Both still guess on ambiguous photos: a bag of unassembled plug parts ("microswitch parts" / "JST cable"), clear LED-strip clips ("3M Scotchlok" / "JST 3-pin"). On the printed numbers themselves the two read alike (the 12B spelt "NeoPixel" where the 4B wrote "NooPixel"; both read "MAN3620A 314 E" and "276-0145"), and the shop lookup only takes an exact match anyway. **Colin chose the 4B** (2026-11-12): the machine runs other things on the card, the numbers get read either way and the shops supply the details, so the 12B's judgement-call gains don't earn the whole card. It stays pulled; `AI_MODEL=gemma3:12b` switches. `neutts` stays stopped at Colin's choice: the rest of the card is kept free for other things, not for this.

**The bake-off (2026-11-12, `scripts/ai-bakeoff.mjs`: the quick look over all 27 dev parts with photos, five models, scored by me against the photos).** Reading the key number off the five labelled parts (the "MAN3620A 314 E" displays, RadioShack "276-0145", "adafru.it/1112", the NeoPixel bag's "adafru.it/1938", the IDC bag's "IDS-34-P"): **Gemma 4 e4b 5 of 5**, Gemma 3 4B 3 (it reads "adafru.it/11112" and "IPS-34-P"), Gemma 3 12B 3 (the same two slips), Qwen3-VL 8B 2 (blank on nine parts, 36 s a part: it runs out of room thinking), MiniCPM-V 1 (garbles numbers: "MAN362", "DS-34-P", "adafru.it/112"). Inventing things on unmarked parts, the fault Colin most wants gone: Gemma 3 4B the worst ("ATMEGA328P ICs" for a bag of male headers, "JST-XH 1.5mm" for female headers, "2.1mm DC barrel jack" for a 9V battery snap, "WS-100"), Gemma 3 12B next ("3M 4000 Series terminal block", "28-pin DIP socket", a "Power relay 10A 250V" for the Kycon plug kit), MiniCPM-V once but badly ("1000V 1A Ceramic Capacitors" for LED clips), **Gemma 4 e4b almost never**: with nothing printed it says "Multi-pin header connector", "Plastic connector sockets", "2-pin red and black cable with connector", though it isn't always right either ("Foam blocks" for the displays sitting in pink foam, "3-pin wire connector" for a bare LED). Time a part once loaded: Gemma 3 4B 3.7 s, Gemma 3 12B 7.3, MiniCPM-V 8.9, Gemma 4 e4b 8 to 10, Qwen3-VL 8B 36; loading Gemma 4 after idle takes about 40 s (Ollama drops a model after five minutes unused). The card: Gemma 4 e4b takes about 5.5 GB loaded, the 4B about 4, the 12B 8. **Verdict:** Gemma 4 e4b is the honest one and the best reader, at about two and a half times the 4B's time and 1.5 GB more of the card. The prompt now also says to name only what's printed or plainly visible ("a plain right name beats a specific wrong one"), with a guard behind it that cuts any part-number-like token from a photo-only name that isn't in the markings; the bake-off ran with that in place for every model. Still to do: reading the label at capture time.

### DEC-054: The AI data fill runs beside the live app, on one model container shared with the dev instance

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q96) |
| **Deciders** | Colin |
| **Category** | Architecture / Process |

**Context:** After the second round of AI work (DEC-053) and the five-model bake-off, Colin chose Gemma 4 e4b and asked for the AI on the live app "so I can test it for a while". Until now the model container was part of the dev compose project and the live compose file set no `AI_URL`, so the live app ran the AI code switched off.

**Decision:** The Ollama container moves to the **production compose file** (`compose.yaml`): it's the always-on side, so the model is always there. The live app reaches it as `ollama` on the compose network; the **dev instance uses the same container** by joining the live stack's compose network (`bin-there-prod_default`; a port bound to 127.0.0.1 on the host turned out unreachable from a container), so the card holds one copy of the model and the models volume (`bin-there-ai_ollama-models`, external) is pulled into once. The dev compose file no longer defines an Ollama service. Both instances default to `gemma4:e4b`; `AI_MODEL` in either `.env` overrides. The production `.env` carries the shop keys (the Digi-Key pair from the production app, copied line for line from the dev `.env` without being read); `SEARCH_URL` points at the SearXNG on the host as before. Leaving `AI_URL` empty in the production `.env` turns the AI off there again without touching the file.

**Consequences:** The dev instance's AI depends on the live stack being up, which it always is; rebuilding the live app restarts its container but not Ollama (only a compose change to the `ollama` service does that). `neutts` stays stopped (Colin's choice, DEC-053): Gemma 4 e4b takes about 5.5 GB of the card while loaded and is dropped five minutes after use. One `docker compose up -d --build` in `~/bin-there-prod` brings both containers up; `DEPLOY.md` says so.

### DEC-055: Counting chosen at capture (an exact count of 1 unless changed); parts queued for the AI at capture, the answer kept for review

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q98) |
| **Deciders** | Colin |
| **Category** | UX / Architecture |

**Context:** Colin found himself going back into every captured part to change how it's counted and set a count of 1, because Quick capture left the count blank and the category picked later set the way of counting. And with the AI now on the live app, he wanted new parts looked up by themselves, in a queue, with the suggestions waiting for him; and, when a part is queued or being looked up, to see that on the edit page and on Fill in details, with a Cancel.

**Decision:** **Counting at capture:** Quick capture has a Keep track by switch (Exact count, the default, with a count of 1 filled in; or Plenty / low / out, Plenty by default). A part with its own sticker is a returnable unit and isn't counted, as before. A count or a level set at capture is the owner's choice: picking a category later never changes the way of counting for a part that has a count or a level (before, the category's default won unless a number had been typed). **The AI queue:** a toggle on Quick capture, "Look it up with AI after saving" (remembered on the device, on to start), queues each saved part that has a photo or a name. The server works the queue one part at a time in the background with the full look-up (photo, shop page or printed number at the shops, datasheet), stores the answer on the part (`ai_result`, with when and which mode) and bumps the live-update version so open screens refresh. The part's place in the queue is on the part too (`ai_job`: queued, running, failed, with the error), so the queue survives a restart; whatever a crash left running is queued again on start. Every manual look-up (the form's button, Fill in details' Suggest names) stores its answer the same way. On Fill in details a queued or running part shows a spinner, its state and Cancel under the row; a failed one the error and a dismiss; an answered one "AI thinks: name · category" with Use and a dismiss (the name and category are used in one save; the rest of the answer stays for More details). The part's form shows a stored answer straight away with when it was looked up, Look again, and the same queue status and Cancel. Cancel clears the part's job at once; a look-up already under way runs to its end and its answer is thrown away, since a model call can't be interrupted. Dismiss clears the stored answer.

**Consequences:** Capture twenty parts and walk away; the answers are there when Fill in details is opened, and nothing waits on the model. Four columns on `items` (migration 0019). `POST /items/:id/research/queue`, `DELETE …/queue` (cancel), `DELETE /items/:id/research` (dismiss). The queue is in-process: one worker, one part at a time, so the card is never asked for two models at once. Found on the way and fixed: the compact scan box on a phone squeezed its words to one a line (the trigger note and the Camera button now wrap under them), and a temperature or a percentage read off a part ("105°C", "5%") was being tried at the shops as a part number. Proven on the dev instance: two parts queued at once, the first looked up while the second waited, both answers stored (23 and 32 s). Not done: bulk editing of checked parts from Inventory and Search, which Colin raised at the same time and is next.

### DEC-056: Categories and their fields are editable on a Categories screen

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q100) |
| **Deciders** | Colin |
| **Category** | UX / Data |

**Context:** Colin wanted to add categories and change their fields (Gauge and Type on connectors, say) and have that stick. Categories were already rows in the database with their field list attached, and the starter set is only written into an empty database, so the persistence was there; what was missing was a screen, and rules for what happens to parts' values when fields change.

**Decision:** A **Categories** screen (`/categories`, from the bottom of Locations and from "Manage categories and their fields" under the category picker on a part's form): the list, and for each one its name, its usual kind and way of counting, and its fields to add, rename, reorder and remove; a new category at the top. Changes save as they're made. The rules: **a field keeps its hidden key when renamed or moved**, so every part's value stays attached (`PATCH /categories/:id` takes the fields with their keys; one without a key is new and gets a key from its label, made unique); **removing a field with values** warns how many parts hold one and asks again, and the values stay stored on the parts unseen, coming back if a field with the same name is added; **deleting a category parts still use is refused** with the count, until they're moved (bulk editing, next). The category's parts are re-indexed for search when fields or the name change. `GET /categories/usage` gives the counts the screen shows.

**Consequences:** The AI prompts and the forms read field labels from the category, so they follow the changes with no work. Not done: a field's type (every field is text, as before) and sub-categories (the table has a parent column from the start, unused).

### DEC-057: Bulk editing of checked parts from Inventory and Search

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q101) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin wanted to check a handful of parts on Inventory or Search and change them together: a run of captures that all belong in one category, a box's worth carried somewhere else, a set that should count by level, or a batch to delete. Deleting a category (DEC-056) also needs a way to move its parts out first.

**Decision:** A **Select** button on Inventory (list and tiles) and on Search turns every row or tile into a checkbox (the pin and the − / + go away while selecting, since a button can't sit inside a button). A bar at the bottom, over the phone's nav bar, shows how many are checked, offers "All N shown", and four actions: **Category** (the type-to-find picker, with none allowed), **Move** (scan a place or pick from the list; everything each part has goes there, Q101: every count collapses into the one place, units at home go there, a checked-out unit keeps its outing but comes back there, and the place becomes the part's one home unless it's a project kit; a part with nothing recorded anywhere is put there, not counted; a part already there is left alone), **Counting** (exact count or plenty / low / out, converting the stock as the form does), and **Delete** (a confirmation in the bar; the same soft delete as the part page). The server does each part on its own (`POST /api/items/bulk`), in its own transaction with its own activity entry, so one part that can't take the change doesn't stop the rest, and Undo is per part from its page or Activity; the answer says how many took it and which didn't, and the toast repeats that. Selecting ends after an action.

**Consequences:** `bulk.ts` on the server, `moveEverything` in `stock.ts` (one event with every stock row, unit and home before, so Undo puts it all back; a unit's home is now part of what Undo restores). `BulkBar.tsx` on the web, used by both screens; `ItemList` and the Inventory rows and tiles take a `select`. Not done: a bar-level Undo (the toast's Undo takes one event; a bulk undo would be a new kind of event) and bulk editing from a place's page.

### DEC-058: Adding several places in a run: name, scan, next

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q103–Q104) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin added a batch of mini totes and found it one form per place. He didn't want to preset a count; he wanted a loop that fits how he works with stickers in hand: name it, scan, and the next one is ready, until he says he's done (Q103).

**Decision:** **Add several** (from Locations next to Add location, and from a place's page next to Add inside) opens the New location form in a run (`/locations/new?many=1`). The form is the same, with the sticker box replaced by the scan target: **a scan saves the place with that sticker** on the spot, with a beep; **Save without a sticker** saves it without one (Q104); **Done** goes back to the parent. After each save the next is ready: with **Number goes up** on (the default), the name's trailing number counts up, keeping its padding ("Shelf 03" to "Shelf 04", "Tote A1" to "Tote A2", a name with no number gets " 2"; `nextName` in `src/shared/names.ts`); off, the same name is ready again, for a run of places named by what they are ("Empty mini tote", Colin's case). **Every other setting stays as it was** (where, type, bin size, positions, grid) and can be changed before any save, so a run can mix types and places (Colin's ask). In a rack or shelf, each new place takes the next free position, and when none is left it says so and the place goes in without one. A list under the form shows what the run added, each with its sticker or "no sticker" and its position, and a refused sticker (already in use) shows its error and leaves the name waiting.

**Consequences:** No server change: the run uses `POST /locations` as the form always has. Bins keep their automatic numbers, so for bins the name box stays empty. Not done: a camera-first flow where the scan comes before the name.

### DEC-059: Choice fields: a category field with a fixed list of options

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin) |
| **Deciders** | Colin |
| **Category** | UX / Data / AI |

**Context:** Asked whether fields should have types or drop-downs, Colin said he wouldn't use a drop-down for resistance or voltage, but would for a finite set: battery chemistry, capacitor type. The AI guard (DEC-053) already prefers a plain right answer to a specific wrong one, and a closed list is the strongest form of that.

**Decision:** A field is **Text** (as before) or **Choice**, set on the Categories screen with the options typed as a comma-separated line, saved on blur. On a part's form a choice field is a drop-down: blank, the options, and, until it's changed, a value from before the field became a choice, marked "(not in the list)". **The AI gets the options** with the field ("exactly one of: Li-ion | LiPo | NiMH; leave it out if none fits") and its answer is kept only when it is one of them, put into the option's own spelling; anything else is dropped. Turning a choice back to text keeps the parts' values and drops the options. `FieldDef` gains `type: "choice"` and `options`; `PATCH /categories/:id` takes `type` and `options` per field (left out, a field keeps its type).

**Consequences:** No migration: field definitions are JSON on the category, and a field without a type reads as text. Not done: suggesting values already used for text fields (next), and a number type (Colin saw no use for it: values carry units).

### DEC-060: Text fields offer the values the category's parts already hold

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** The cheaper half of the drop-down question (DEC-059): for fields that aren't a finite set, consistency still matters ("20 AWG" vs "20awg"), but a list to maintain doesn't fit.

**Decision:** On a part's form, every text field of the category offers, as you type, the values other parts of that category already hold, most used first then alphabetical, at most 30 a field (`GET /categories/:id/values`, the browser's own suggestion list under the box). Blank values, archived parts and choice fields are left out. Nothing is enforced: a new value is typed as before.

**Consequences:** One small read per form open, only when the category has a text field. Not done: the same on Fill in details' rows (they open the same form in a popup, so they get it there). Shipped to the live app with DEC-055 to DEC-059 on 2026-11-12 (backup `2026-11-12_160213`, `main` at 01066d4).

### DEC-061: No instant read at capture; the queued look-up is the one path, with the model kept loaded

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q111) |
| **Deciders** | Colin |
| **Category** | UX / Architecture |

**Context:** Colin asked whether a part number could be read off a part the moment it's captured, to confirm with a tap, so a one-off addition doesn't wait on the background look-up, and whether a lighter tool than the model (plain OCR) would do it. Measured on the live card (GTX 1080 Ti, 11 GB): RapidOCR reads a label in 0.6–0.9 s on the CPU but misread one character of a part number (IPS for IDS) and missed a wire's marking; Gemma 4 e4b, loaded, reads the same label right in about 2 s with a plain prompt, and the app's photo step with its schema takes 8–17 s with the model's thinking on and 3–4 s with it off, same markings. The minute Colin was seeing was the model being unloaded: Ollama drops it after five idle minutes and a cold load is 47 s. Colin didn't want it kept loaded if that blocked other models; tested: a pinned model is still unloaded when a bigger one needs the room (gemma3:12b beside it), and reloads on its next call. An instant glance was then built (`POST /api/ai/glance`, chips under the photo for the part number, name and category, a confirmed number saved with the part) and tried from the phone. The first try failed: the model was cold, a cold load plus the read ran past the 60 s an iPhone browser waits, "Load failed". The real question followed (Q109–Q111): the glance is the same model reading the same photo, so it reads nothing more accurately than the queued look-up; what it adds is a human check with the part in hand and finishing simple parts in two taps, at the cost of a second model call per photo, more on the capture screen, and the same guesses reviewed in two places. The rule of thumb that picks "part number" chips (letters and digits, not a unit or a date) also offered "2000mAh".

**Decision:** No instant read. Quick capture stays as DEC-055 left it: photo, count, "Look it up with AI after saving", and the answer reviewed once on the part. The glance route, the chips and the capture-time part number were pulled before shipping. What stays from the work: (1) every request the app sends Ollama carries `keep_alive: -1`, so the model stays loaded once used, and the app loads it at start (`ollamaWarm`, a few tries over a few minutes for the boot case when the card isn't up yet); in the app rather than on the model container, so it holds on both instances. (2) The look-up tries a part number on record (typed on the form) at Mouser and Digi-Key before the printed ones ("Found at Mouser by the part number on record"). (3) A capacity or weight (2000mAh, 7.4Wh, 500g) is no longer taken for a part number.

**Consequences:** About 6.6 GB of the card stays allocated; any other model that needs it takes it, at the cost of one 47-second reload of Gemma afterwards. The first look-up after a reboot no longer waits for the load. The reads wobble (three reads of one wire photo gave three answers), which is why the one review on the part stays. Ideas kept for later, not built: the model labelling every marking with what it is (maker's number, shop order number, brand, rating, date code) in place of the rule of thumb that decides what gets tried at the shops, which is where accuracy would actually be gained; the shop bag's 2D barcode read at capture (Digi-Key and Mouser bags carry the exact part number; the scanner already decodes codes) for the add and add-to-existing flows; RapidOCR/PaddleOCR (16 MB, could run in the phone's browser) if an instant read is ever wanted after all. Shipped to the live app on 2026-11-12 with DEC-061 to DEC-063 (backup `2026-11-12_214745`, `main` at 979023d, migration 0020 applied on the live database).

### DEC-062: Per-unit fields: a category field each stickered unit holds for itself

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q112) |
| **Deciders** | Colin |
| **Category** | Product / Data |

**Context:** Colin has ten identical LiPo batteries, each with its own sticker, and wants to track each one's charge level (full, storage, used). He asked whether they should be ten parts, whether each needs its own photo, or whether a third kind of thing was needed: one part, many instances. The app already has that: a returnable part with stickered units, each with its own sticker, location, home and checked-out state, the specs and the photo on the part. The gap was state per unit: category fields live on the part, so a Charge level field would have been one value for all ten.

**Decision:** A category field can be marked per unit ("Each stickered one has its own" on the Categories screen; `perUnit` on the field, kept across edits like its type). Such a field is held by each stickered unit: `units.attributes` (migration 0020), by field key, set from the unit's row on the part's page (a drop-down for a choice field, a box for text, saving as it changes; `PATCH /units/:id` with the whole map, blanks dropped). It stays off the part's form, off the values-already-used list, and out of the AI's field list, since it's each unit's own state and not something a page can tell. A unit's details are a detail, not a stock change: no event, no Undo, like a part's details. Ten identical batteries are one part with ten units and one photo; the other nine stickers are added from the part's page with the scanner.

**Consequences:** A per-unit field on a part with no stickered units has nowhere to show, which is right: it's for the stickered kind. Not done: a per-unit field in the bin sheet or the checked-out list; setting it right after scanning that unit's sticker (today a scan opens the part, and the unit's row is there); searching by a unit's value. Checked in `categories-check.mjs` and the API tests. Shipped to the live app on 2026-11-12 with DEC-061 to DEC-063 (backup `2026-11-12_214745`, `main` at 979023d, migration 0020 applied on the live database).

### DEC-063: A stickered unit can be removed from its part, undoably

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-12 |
| **Status** | Accepted (Colin, Q113) |
| **Deciders** | Colin |
| **Category** | Product |

**Context:** Colin scanned the wrong sticker onto a part (adding a stickered one from the part's page) and couldn't take it off: the only thing that retired a unit was deleting the whole part, which takes every unit with it.

**Decision:** Each stickered unit's row on the part's page has a Remove (bin icon, confirmed first). It retires that unit and frees its sticker for something else; the part stays, with its other units, or with none. It's a stock change like the others: one `retire` event with the unit as it was in `undoData`, Undo on the toast while it's the part's latest change, and the unit comes back with its sticker unless that has gone on something else since (then without, as with undoing a part's delete). The activity log reads "Stickered one removed". `DELETE /api/units/:id`.

**Consequences:** Retired units stay in the table as before (history keeps pointing at them). Not done: removing from the checked-out list or the bin sheet. Checked in the J8 story of `stories-walk.mjs` and the API tests. Shipped to the live app on 2026-11-12 with DEC-061 to DEC-063 (backup `2026-11-12_214745`, `main` at 979023d, migration 0020 applied on the live database).

### DEC-064: The AI fills the fields of the category it picks, in the same run

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q115) |
| **Deciders** | Colin |
| **Category** | Product / AI |

**Context:** Colin captured three LiPo batteries with no category and the AI look-up queued. The model read 2000 mAh, 3.7 V and the rest off each label and picked Batteries, but filled none of the Batteries fields (Voltage, Capacity): the look-up only asked for the fields of the part's own category, and a part with none has none. One answer put the ratings in a note instead.

**Decision:** When a part has no category and the photo step picks one, the rest of that same look-up fills that category's fields (per-unit ones left out, DEC-062): the extract step is told the category and asked for its fields, not for a category. The photo's category leads the suggestions, and the extract can't name a different one, so the field values always belong to the category suggested with them. On Fill in details the AI's guess under the row shows those values after the name and category, and Use saves them with the name and category in one change, each marked as the AI's with its source; only fields still empty are filled. The form's suggestions list already applies them.

**Consequences:** Quick naming (DEC-053) is still the photo alone and fills no fields. A part captured with no photo still gets a category guessed from its name and no fields. Checked in the pipeline tests and in `ai-check.mjs` (a part queued with no category: its category leads, its field is shown under the row, Use saves it). Shipped to the live app on 2026-11-13 with DEC-064 to DEC-066 (backup `2026-11-13_104312`, `main` at 07430ab).

### DEC-065: Names follow one rule and the owner's own names

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q115) |
| **Deciders** | Colin |
| **Category** | Product / AI |

**Context:** The three batteries came back as "Rechargeable Lipo Battery", "Lithium-ion battery pack" and "Lithium Rechargeable Battery": three different products of one kind, named three ways, each copied from a phrase on its label. Colin asked whether naming could be consolidated, through written guidelines or by looking at the names already used.

**Decision:** The model names a part by a rule given in both prompts: the kind of thing first, then the values that tell it apart from others of its kind (voltage, capacity, size, length, pins, count), then a brand or model only when printed and it matters; never a slogan or label copy, never a sentence. Like "LiPo battery 3.7 V 1200 mAh" and "Socket cap screw M3 × 10". With it go the owner's own names: up to 12 from the part's category (or the category the photo picked), most recently changed first, or up to 3 from each category when none is known yet. Those outrank the rule's examples: write the name the way they are written, the same way for the same kind of thing with only the values changed, and the very same name for the very same part. Parts still needing details and archived parts aren't used as examples.

**Consequences:** The convention is whatever Colin's own names in a category are; the rule only decides while a category has none. Renaming the parts already in a category changes how the next ones are named. A part already named isn't renamed by the AI unless its name is missing, vague or wrong, as before. Not done: telling Colin when a new part looks like one he already has. Checked in the pipeline tests and the names query's own test. Shipped to the live app on 2026-11-13 with DEC-064 to DEC-066 (backup `2026-11-13_104312`, `main` at 07430ab).

### DEC-066: Finding pages again: search engines that answer, off-topic hits dropped, part numbers read by the model

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q115) |
| **Deciders** | Colin |
| **Category** | Architecture / AI |

**Context:** Every look-up on the live app since at least 2026-11-11 ran on the photo alone: SearXNG's four default engines block ubuntubot (DuckDuckGo and Startpage a CAPTCHA, Brave too many requests, Google access denied). Colin asked why Mouser and Digi-Key didn't help: their APIs answered, with no match, because the numbers printed on these batteries (LP103450, PL 103750) are cell size codes many makers print, not anyone's part number; and "PL 103750", printed with a space, was never tried at all. Tried from the server, Yandex answered eight part searches out of eight with shop and datasheet pages; Bing answered part numbers with film and adult sites, which is how it treats a caller it takes for a bot; Yahoo, Qwant, Mojeek, Presearch, Ask and Seznam failed.

**Decision:** The app names the engines it asks (`SEARCH_ENGINES`, both compose files `yandex,brave,duckduckgo`; SearXNG lets a request use engines its settings leave off, so its shared settings are untouched): Yandex, with Brave and DuckDuckGo kept for when they recover; never Bing. A hit that shares no word with its query is dropped before any page is read. The photo step now also lists the markings that are part numbers, spaces taken out, and the shops try those first (only ones actually printed), then the rule-of-thumb ones, five numbers at most.

**Then the real runs (2026-11-13, the three batteries on the dev instance with Gemma 4 e4b):** with search answering, the first run went wrong in new ways, since this path had hardly run before. Four shop pages of numbers came to about 8,100 tokens, the whole of the model's 8,192-token window, so the instructions fell off the front: one answer rambled (a price of 18650, from an "18650 cell" on a page about other batteries; a sentence as the supplier), one came back empty; and the model's hidden thinking took 860 of its 1,500-token answer allowance. So, as part of this decision:
- **Room to read and answer:** the model's window is 16,384 tokens and its answer allowance 3,000 (`MODEL_OPTIONS` in `ollama.ts`; the card's memory use didn't change, 5.6 GB either way), and the model is warmed at start with the same window so the first look-up doesn't reload it. The pages found share 14,000 characters between them. Each model call logs its prompt and answer size and whether it hit the limit.
- **A page must name the part:** when something identifying is printed on the part (a part number or a brand, as the photo step reads them), a page found by search is used only if its text names one; up to its last two characters may differ (LM2596S, LM2596). Pages naming it are opened first, at most six opened and three used; when none does, the notes say only what's printed was used. A part with nothing identifying printed (a bare connector, a screw) reads the pages as before. The number on record doesn't count, being often a shop's own.
- **Never a listing:** a shop's search results or category page (AliExpress `/w/`, Amazon `/s`, `/b/`, `/clp/`, eBay `/sch/`, any `?k=` or `?q=` address) lists other sellers' prices and isn't read.
- **Values that are values:** a price must stand next to a currency sign on its page; a supplier is a name of up to 60 characters, not a sentence; a field's value keeps its unit.

After these, the same three runs came back whole in 30–40 s each: the first with its maker's own page (PKNERGY, the 10 × 34 × 50 mm size, the link), the second from its label alone (the pages found were about other cells), the third with chemistry and size from a page naming MakerHawk.

**Consequences:** Yandex may start blocking too; the look-up's notes say so when the search fails, and the list is one line in the compose files. Generic cells and other no-name parts have no maker's number for Mouser or Digi-Key to match, so the web search is the path for them. Checked in the pipeline and search tests, and against the live search service. Shipped to the live app on 2026-11-13 with DEC-064 to DEC-066 (backup `2026-11-13_104312`, `main` at 07430ab).

### DEC-067: One Move sheet: it asks what's moving, then where, and says what it will do; each part shows its ID

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q118) |
| **Deciders** | Colin |
| **Category** | UX |

**Context:** Colin's LiPo battery part (ID 24) had seven stickered units and showed "not counted". It was captured with no place, so the seven stickers added from its page were saved with no location; with no place yet, the only button was "Add another place", which made an empty, uncounted entry in Nano Tote and left the units nowhere. Moving them meant seven separate moves behind an unlabelled arrow. Colin pointed out the deeper flaw: the part's page had three move controls that each moved something different (a unit's arrow moved that one unit; a place's Move moved only the loose count, never stickered units; Add another place moved nothing), and with many stickered units he couldn't tell whether he was moving one or all. He asked for simplicity and consistency: always say what will happen ("Move this unit", "Move all"), and one dialog that asks whether to move one unit, all of them, or a chosen few (by tapping or scanning their stickers), used the same way every time. He also asked for an automatic ID on each part, shown only on its page, to refer to a part by. Q117 proposed fixes in words; Q118 showed them drawn, and he accepted.

**Decision:**
- **One Move sheet** (`MoveSheet.tsx`) for every move of a part's things: each place card on the part's page, each stickered unit's row, the new "No place yet" card, and the bin sheet's Move all open it, each worded "Move…". "Add another place" is gone: moving some of a part to a new spot covers it.
- **It always asks what's moving, then where.** For stickered units: all of them (or all here), just this one, or Pick which (a checklist that opens when chosen and starts empty, or with the unit whose row opened it; the first unit sticker scanned switches to Pick which with just that one, and more scans add to it; with none ticked the button reads "Tick or scan the ones to move"). For a counted part: all of its count from that place, or Some (a number). For an uncounted part: all of it, or some of it (it'll be in both places). When a part is in two or more places, Everything it has (the bulk move, DEC-057, now on the part's page too). Where it was opened only decides which choice starts ticked (a unit's row starts on Just this one); the choices and wording are the same from everywhere.
- **Where to:** scan the place or pick it from the list; scanning a place's sticker sets or changes it. With several stickered units the prompt says both things a scan does ("Scan where they're going, or scan the ones you want to move", Colin's wording, after the first version said only "or pick it"); otherwise "Scan where it's going".
- **The button says exactly what will happen:** "Move 7 to Nano Tote", "Move 10 to Bin 0043", "Move some to Workbench", "Move everything to Nano Tote". Nothing moves until it's pressed; the toast says the same and offers Undo.
- **Many units, one step:** `POST /units/move` moves any of a part's stickered units in one undoable event. A unit with no home gets the place as its home, and so does the part if it has none; a checked-out unit is refused (check it in first).
- **Stickered units count themselves:** where stickered ones land, an empty "not counted" entry for the part goes (so Colin's part fixes itself when he moves its seven units into Nano Tote), and moving everything a stickered-only part has makes none.
- **"No place yet"** on the part's page says how many stickered ones aren't anywhere, or that the part isn't in any place, with Move…; each such unit's row says "No place yet".
- **The part's ID** ("ID 24", the database's own number, never reused) sits by the name on the part's page and nowhere else.

**Consequences:** Every move now takes the extra step of the sheet, even when there's one choice; seeing the same screen every time is the point. The old single-unit route (`POST /units/:id/move`) stays for the API. Not done: the same sheet for check out (it stays its own), for moving many parts at once (Select's bar, DEC-057, which already says how many parts), and for moving bins and boxes themselves. Checked in `move-check.mjs` (Colin's case end to end, a unit's row with a scanned sticker, some of a count, some of an uncounted part, a part with no place, Everything, Undo, the ID) and the API tests. Shipped to the live app on 2026-11-13 (backup `2026-11-13_121901`, `main` at f64913a); Colin's part was left for him to move with the new sheet, and the same move on a copy of the live data put the seven in Nano Tote as their home with the empty entry gone.

### DEC-068: The app never tells you how to work a scanner

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin's instruction) |
| **Deciders** | Colin |
| **Category** | UX / Wording |

**Context:** Every scan box said "Pull the scanner's trigger" (or "…or pull the scanner's trigger" under the camera button), and so did the scan panel in the sidebar and the Stickers screen's hint. Colin: it never needs saying, since it's a given, and some scanners have no trigger; on the Move sheet the line sat right under a heading that already said "Scan…", which made the grammar awkward.

**Decision:** No screen tells you how to work a scanner. A scan box says what a scan does now ("Scan where it's going") and offers the camera button on devices that use one; where there's another way to do the same thing, the words before it are just "or you can" ("or you can Pick from list"). The sidebar's scan panel says what a scan does and nothing more. The Stickers screen's hint for scanner mode reads "Scan the sticker for the chosen bin."; the Settings description says "every screen says when a scan will do something".

**Consequences:** The scanning setting (DEC-044) still decides whether the camera button shows; it no longer adds any words. New screens follow the same rule. Checked in `stickers-check.mjs` (no "trigger" anywhere on the screen in scanner-only mode) and the Move and bin-sheet checks. Shipped to the live app on 2026-11-13 with the Move sheet's follow-up (backup `2026-11-13_123654`, `main` at 967c89f).

### DEC-069: A part's own fields named like its category's become them; the category editor groups each field

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin's bug report) |
| **Deciders** | Colin |
| **Category** | Data / UX |

**Context:** Colin reported that changing a category's fields didn't reach the parts already in it, even after switching a part's category away and back. The live data showed why: before the Bearings category had fields, he gave his Linear bearing its own fields on its form ("Other fields": OD 15mm, ID 8mm, Width 24mm). Then he added ID, OD and Length to the category. A field's key is made from its name in lower case ("id"), and nothing matched "ID" to "id", so the part's values stayed as its own fields and the category's fields stayed empty; he retyped 8 and 15 into them. The part's page also listed every stored value under its raw name, so it showed both. Separately, the editor's box for a choice field's options sat on the line with the Text / Choice switch and the per-unit checkbox, between fields, so it wasn't plain which field it belonged to (his Bearings "Length" field has the options Rotary and Linear).

**Decision:**
- **A part's own field named like a category field is that field.** Names match on their letters and digits alone ("ID", "id", "I.D." are one; "Thread pitch" matches "thread_pitch"). It's applied when a category's fields are saved (to every part in it), whenever a part is saved (with the category it ends up in, so moving a part into a category lines it up), and once at each server start for what's already stored.
- **When both hold a value:** if they say the same thing ("8" and "8mm", the same number; "15 mm" and "15mm") they merge, keeping the fuller one; if they differ, both stay, nothing lost. Per-unit fields (DEC-062) live on the units and are left alone; a part's own field never takes another category field's key.
- **The part's page** lists the category's fields first, in the category's order, then the part's own, as its form does.
- **The category editor:** a choice field's options box sits right under the field's name, above its Text / Choice switch; each field has its own light outline, so its name, options and switches read as one.

**Consequences:** Colin's Linear bearing becomes ID 8mm, OD 15mm, with Width 24mm still its own field, at the first start after the ship. Matching ignores spelling beyond letters and digits, so "OD" and "Outer diameter" stay separate. Checked in the API tests (his values exactly; the merge rule; the start-up pass) and `categories-check.mjs` (adding Pin count picks up a part's own Pin count; the options box under its name). Shipped to the live app on 2026-11-13 (backup `2026-11-13_131745`, `main` at 67c20fa); the first start matched one part, the Linear bearing, to ID 8mm, OD 15mm, Width 24mm, as on the dev copy first.

### DEC-070: Categories and Print stickers in the sidebar and the phone's Menu, not at the bottom of Locations

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q119 for the phone) |
| **Deciders** | Colin |
| **Category** | UX / Navigation |

**Context:** Colin asked why Categories and Print stickers were reached from the bottom of the Locations page, along with a Settings link he doesn't need there. They were put there when built (DEC-052, DEC-056) because the phone's bottom bar was full and the bottom of Locations (the old home page) reached both phone and computer without redesigning navigation; on the phone that block is also the only way to Settings. Convenience, not a reason.

**Decision:** On a computer, the sidebar has Categories (after Inventory, since it describes parts) and Print stickers (after Locations, since stickers go on places), and the Locations page no longer carries those links or Settings. On a phone, each screen has a slim top row, "Bin→There" on the left and a "☰ Menu" button on the right (Colin chose a menu at the top over a More tab in the bar, Q119, and asked for the hamburger with the word Menu rather than "More"). It drops down Categories, Print stickers, Search and Settings, the sidebar's entries the bar doesn't hold, and closes on a pick, a tap outside, Escape or a new screen. It sits in a row of its own rather than in each screen's title row so it never covers a screen's own top buttons (the part page's Pin and Edit). The links at the bottom of Locations are gone on phones too.

**Consequences:** Checked in `stickers-print-check.mjs` (no such links on Locations on a computer; the sidebar entry), `categories-check.mjs` and `stickers-check.mjs` (the phone: no links on Locations, the Menu's four entries, Escape, Settings). The computer half shipped with DEC-069; the phone's Menu on 2026-11-13 (backup `2026-11-13_133135`, `main` at 87ae137).

### DEC-071: Fields have IDs; universal, category-only and custom fields

| Attribute | Value |
|-----------|-------|
| **Date** | 2026-11-13 |
| **Status** | Accepted (Colin, Q120 to Q123; the names are his) |
| **Deciders** | Colin |
| **Category** | Data / UX |
| **Supersedes** | DEC-069's name matching |

**Context:** After the Linear bearing fix (DEC-069) Colin asked why a part's form lets you add fields at all, whether those were custom to the part (the form didn't say), why they could collide with the category's fields, and whether fields were tracked by unique IDs or by name, calling comparison by name a rookie mistake. He was right. A category field's key was made from its name ("ID" became "id") and a part kept one bag of values holding both its category's fields and its own, told apart only by whether a key matched; two categories' "Voltage" shared the key "voltage"; and DEC-069 had repaired the bearing by matching more names. Talking it through (Q120 to Q123): he wanted some values to survive a category change (resistor to none to capacitor keeps its voltage), a naming convention instead of inheriting whatever was typed first, and then saw that a capacitor's Type shouldn't land in a switch's Type. So the same name isn't always the same field, which is what IDs are for.

**Decision:**
- **Every category field is one row** in a `fields` table with its own ID. Its key everywhere (a category's template, a part's values, a stickered unit's values, the AI's marks and stored suggestions) is that ID ("f12"), never its name.
- **Universal field:** one field used by any number of categories. Its value belongs to the part and follows it through any category change; in a category whose template doesn't have it (or with no category), it shows with the part's custom fields, and it's a template field again when a category has it.
- **Category-only field:** belongs to one category. Its value stays behind when the part leaves, unseen, and is there again if the part comes back. A field starts category-only.
- **Custom field:** on one part only, in its own store (`items.custom`, by name). The form's section is titled "Custom fields · only on this part" and points to the Categories screen for the fields every part of the category has.
- **How a field becomes universal:** adding a field whose name another category already has, the editor asks: use that one (it becomes universal), or make a separate one only for this category. Two existing same-named fields can be made one with "It's the same field: make it universal" on either's row (`POST /fields/merge`): the parts keep their values; not undoable.
- **Names are compared in one place:** when a field is made or named, to make that offer, to refuse two fields of one name in one category, and to turn a custom field typed with the name of one of the part's fields, or of a universal field, into that field (refused if it already holds a different value). Nowhere else.
- **The naming convention** (enforced by the server for category and custom fields): spaces tidied, the first letter a capital, the rest as typed, so "voltage" is "Voltage", "thread pitch" is "Thread pitch", and "ID" stays "ID". Renaming a universal field renames it in every category that uses it: it's one field.
- **A field dropped from a category and added again by name** is the same field, with the parts' values (as before).
- **The migration** (`migrateFields`, run when the database opens, once): each category's fields become rows; same-named fields in different categories stay separate, since only Colin knows which are really one; every stored value, AI mark, stored AI suggestion and unit value is re-keyed; a part's values that weren't its category's fields become its custom fields (the bearing's Width).
- DEC-069's name matching (`adoptFields`) is gone; its other half (the part's page lists category fields first; the editor's options box under the field's name, each field outlined) stays.

**Consequences:** The same-named fields across Colin's categories (Voltage, Package, Type, Size, Length, Current, Part number, ID) are separate until he makes the ones that are really one universal, on the Categories screen. Per choice field, each category keeps its own options, also for a universal field. Search finds a part by the labels and values of the fields its page shows, and by its custom fields. Not done: a list of all fields in one place; making a field universal before a second category uses it; un-merging. Checked in the API tests (the three kinds through category changes, merge, the migration from the live database's shape) and `categories-check.mjs`, and the migration was run on a copy of the live data first. Shipped to the live app on 2026-11-13 (backup `2026-11-13_143450`, `main` at 55931d1, migration 0021 and the re-keying applied on the live database: every value and AI mark kept, the bearing's Width a custom field). A field's same-named twins in other categories show as one line with a button per category and All.

## Decision Index

| ID | Title | Category | Status | Date |
|----|-------|----------|--------|------|
| DEC-001 | Per-item quantity tracking mode (exact vs. level) + count freshness | Product | Accepted | 2026-11-02 |
| DEC-002 | Mobile-first responsive web; Pi garage station after ship | Product / UX | Accepted | 2026-11-02 |
| DEC-003 | Tailscale Serve for SPV; Cloudflare Tunnel + Access later for viewers | Architecture | Accepted | 2026-11-02 |
| DEC-004 | TypeScript: React (Vite PWA) + Hono + SQLite/Drizzle, one container | Tech Stack | Accepted | 2026-11-02 |
| DEC-005 | SPV = F1–F8, ship 2026-11-23 | Scope | Accepted | 2026-11-02 |
| DEC-006 | Resize photos on the phone, not the server | Architecture | Accepted | 2026-11-02 |
| DEC-007 | When an item leaves "Needs details" | Product | Accepted (name and category, enforced on save by DEC-037) | 2026-11-02 |
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
| DEC-029 | A screen that crashes shows a message, not a black page | Architecture | Accepted | 2026-11-04 |
| DEC-030 | Photos show as squares; the original is kept and the crop can be adjusted | UX / Data | Accepted | 2026-11-04 |
| DEC-031 | The part's page leads with its name; photos have a main one, a strip and a viewer | UX / Data | Accepted | 2026-11-04 |
| DEC-032 | Picking a place: tap a row to look inside, Choose to pick it; pin from Inventory | UX | Accepted | 2026-11-04 |
| DEC-033 | Places have positions (rack slots); "add" means a plus, not a camera | UX / Data | Accepted (positions superseded by DEC-034) | 2026-11-04 |
| DEC-034 | Racks have a size and numbered positions; drag to arrange | UX / Data | Accepted (drop behaviour changed by DEC-035) | 2026-11-04 |
| DEC-035 | Dropping a box in a rack moves the others along, and you see them slide | UX | Accepted | 2026-11-04 |
| DEC-036 | Bin tiles show the part's photo, with a per-box switch back to names | UX / Data | Accepted | 2026-11-04 |
| DEC-037 | Fill in details on one page; a category box you can type in; amounts in the details form | UX | Accepted | 2026-11-05 |
| DEC-038 | Where a part is, told as directions: a numbered route, the box as a small map, the level in words | UX | Accepted (route form added the same day) | 2026-11-06 |
| DEC-039 | The AI deploys to ubuntubot itself, after a backup | Process | Accepted | 2026-11-06 |
| DEC-040 | A dev branch and a dev instance; the full checks gate `main` | Process | Accepted | 2026-11-06 |
| DEC-041 | Quieter grid tiles: colour as the outline, a dark tint inside, names in one type, a veil for the unchosen | UX | Accepted | 2026-11-06 |
| DEC-042 | Stickers by scanner: a "next up" panel and the choice moving on by itself | UX | Accepted | 2026-11-06 |
| DEC-043 | A Settings screen: how the Stickers screen starts, the beep, appearance | UX | Accepted | 2026-11-06 |
| DEC-044 | One scan language: a scan colour, a scan target on every scanning screen, the bar as the status | UX | Accepted | 2026-11-06 |
| DEC-045 | The name is written "Bin→There", with the arrow | Product | Accepted | 2026-11-06 |
| DEC-046 | Screens update themselves when another device changes something | UX / Architecture | Accepted | 2026-11-06 |
| DEC-047 | The count under the name, Move in the bin pane, a box's grid size | UX / Data | Accepted | 2026-11-06 |
| DEC-048 | AI data fill as an experiment on the `ai` branch: a local model reads the photos, looks the part up, suggests details | Product / Architecture | Experiment (not on main) | 2026-11-06 |
| DEC-049 | The AI reads the shop's own page first (the link, or supplier + part number); Mouser and Digi-Key through their APIs | Product / Architecture | Accepted (on `dev`) | 2026-11-06 |
| DEC-050 | Two folders on the server, production and development; no folder per branch | Process | Accepted | 2026-11-07 |
| DEC-051 | The details form in two columns when it has the room; the desktop audit (Quick capture and the bin's page still to do) | UX | Accepted | 2026-11-10 |
| DEC-052 | Print stickers from the app: die-cut sheets as PDF, Cricut Print Then Cut as PNG; codes still not recorded until scanned | Product / UX | Accepted | 2026-11-11 |
| DEC-053 | AI data fill, round two: part numbers read off the part go to the shops, quick naming for plain things, the datasheet read | Product / Architecture | Accepted | 2026-11-11 |
| DEC-054 | The AI data fill runs beside the live app, on one model container shared with the dev instance | Architecture / Process | Accepted | 2026-11-12 |
| DEC-055 | Counting chosen at capture (an exact count of 1 unless changed); parts queued for the AI at capture, the answer kept for review | UX / Architecture | Accepted | 2026-11-12 |
| DEC-056 | Categories and their fields are editable on a Categories screen | UX / Data | Accepted | 2026-11-12 |
| DEC-057 | Bulk editing of checked parts from Inventory and Search | UX | Accepted | 2026-11-12 |
| DEC-058 | Adding several places in a run: name, scan, next | UX | Accepted | 2026-11-12 |
| DEC-059 | Choice fields: a category field with a fixed list of options | UX / Data / AI | Accepted | 2026-11-12 |
| DEC-060 | Text fields offer the values the category's parts already hold | UX | Accepted | 2026-11-12 |
| DEC-061 | No instant read at capture; the queued look-up is the one path, with the model kept loaded | UX / Architecture | Accepted | 2026-11-12 |
| DEC-062 | Per-unit fields: a category field each stickered unit holds for itself | Product / Data | Accepted | 2026-11-12 |
| DEC-063 | A stickered unit can be removed from its part, undoably | Product | Accepted | 2026-11-12 |
| DEC-064 | The AI fills the fields of the category it picks, in the same run | Product / AI | Accepted | 2026-11-13 |
| DEC-065 | Names follow one rule and the owner's own names | Product / AI | Accepted | 2026-11-13 |
| DEC-066 | Finding pages again: search engines that answer, off-topic hits dropped, part numbers read by the model | Architecture / AI | Accepted | 2026-11-13 |
| DEC-067 | One Move sheet: it asks what's moving, then where, and says what it will do; each part shows its ID | UX | Accepted | 2026-11-13 |
| DEC-068 | The app never tells you how to work a scanner | UX / Wording | Accepted | 2026-11-13 |
| DEC-069 | A part's own fields named like its category's become them; the category editor groups each field | Data / UX | Name matching superseded by DEC-071 | 2026-11-13 |
| DEC-070 | Categories and Print stickers in the sidebar and the phone's Menu, not at the bottom of Locations | UX / Navigation | Accepted | 2026-11-13 |
| DEC-071 | Fields have IDs; universal, category-only and custom fields | Data / UX | Accepted | 2026-11-13 |

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
