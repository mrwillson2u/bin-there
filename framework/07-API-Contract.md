# API Contract

> **Status:** Draft
> **Last Updated:** 2026-11-04
> **Owner:** Colin

---

## Overview

An internal JSON API under `/api`, consumed only by the app's own React SPA. Request and response shapes are shared Zod schemas (DEC-004). There is no public API, versioning or rate limiting for the SPV.

## Authentication

None in the SPV: the app is reachable only on the tailnet (DEC-003). Later: Cloudflare Access identity header → role (owner/viewer); viewers are limited to GET.

## Error Handling

A missing or malformed JSON body is a `400 VALIDATION`.

```json
{ "error": { "code": "NOT_FOUND", "message": "No location with code ABC123" } }
```
Codes: `VALIDATION` (400), `NOT_FOUND` (404), `CONFLICT` (409, e.g. code already assigned), `INTERNAL` (500).

---

## Endpoints

### Scan
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/scan/:code` | Resolve a sticker → `{ kind: "location", location, children, stock }` \| `{ kind: "unit", unit, item, homes }` \| `{ kind: "unassigned", code }` |

### Locations
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/locations?parent=` | List children (top-level if no parent) |
| GET | `/api/locations?all=1` | Every non-deleted place with its `path`, in tree order (each place right after the one it's in); with only one site, the site itself is left out (DEC-027) |
| GET | `/api/locations/:id` | Location + breadcrumb path + child locations + stock + units |
| POST | `/api/locations` | Create (optionally with `code`) |
| PATCH | `/api/locations/:id` | Edit; changing `parent_id` = **move container** (F9) |
| POST | `/api/locations/:id/code` | Assign a sticker code: `{ code, move? }`. 409 if another location or an item has it, unless `move: true` and it's on another location, which takes it off that one (DEC-022). `PATCH /api/locations/:id` with `code: null` removes a sticker |
| DELETE | `/api/locations/:id` | Soft delete an **empty** location (400 if it holds anything); frees its sticker; returns `{ parentId }` (DEC-013) |
| | | `POST /api/locations`: `name` is optional for a `bin` (it becomes the next global ID, "Bin 0042", DEC-023) and required for everything else; a bin may be created straight into a slot with `slot: { x, y, rotated? }` (409 and nothing created if it doesn't fit). Every `LocationSummary` carries `itemCount` and `preview` (first two item names) so a grid tile can show what's in a bin (DEC-020) |
| PUT | `/api/locations/:id/slot` | Place a bin on its gridded box's grid: body `{ x, y, rotated? }` (top-left cell; `y = rows` is the front-strip row) or `null` to take it off. 400 if not a bin in a gridded box; 409 if it overlaps, overhangs, or is the wrong row for a strip (DEC-014) |

### Project kits (DEC-019)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/projects` | Active kits (`project` locations), newest first, with how many distinct parts each holds |
| POST | `/api/projects/:id/return` | Body `{ itemId?, finish? }`. Sends the kit's stock to each item's first home and each unit to its own home (check-in or move), one logged, undoable event per thing. Things with no home stay and come back in `left[]`. With `finish`, an emptied kit is soft-deleted. Returns `{ returned, left, finished }` |

A kit is created like any location with `type: "project"`. Nothing ever makes a kit a home: moving everything into one keeps the home, and items or units created in one have no home until placed somewhere real.

### Items
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inventory?q=&cat=&kind=&needs=1&low=1&out=1&stale=1&sort=&offset=&limit=` | The Inventory screen (DEC-026). Every filter narrows: `cat` is a category id or `none`; `kind` is `consumable`/`returnable`; `needs`, `low` (as `/items/low`), `out` (a unit checked out), `stale` (as `/review`). `sort` is `name` (default; unnamed last), `recent` or `added`; with `q` and no `sort`, best match. Returns `{ pinned, items, total, next }`: pinned parts that pass the filters (first page only, newest pin first), then a page of the rest (`limit` default 60, max 200), `total` counting both, `next` the next offset or null |
| GET | `/api/items?q=&needs=1` | Search (FTS) with total qty + every location path; without `q`, recently changed. Used by the Search page, put-back and project kits |
| GET | `/api/items/recently-used?days=30` | Items with a non-undone "use" in the last N days, most recent first (put-back suggestions) |
| GET | `/api/items/low` | The shopping list: level items low/out anywhere, exact items at zero or at/below their `lowThreshold`; worst first (DEC-016) |
| GET | `/api/review` | Stale exact counts (`ReviewEntry[]`: item, location path, qty, last counted, changes since), in walking order by location (DEC-015) |
| GET | `/api/items/:id` | Item + stock by location + units + homes + recent events |
| POST | `/api/items` | Create. Used by quick capture: everything optional (`name`, `code` → returnable unit, `locationId`, `qty`/`level`, `categoryId`). Needs details unless it has a name **and** a category (DEC-007) |
| PATCH | `/api/items/:id` | Edit details (clears `needs_details` when complete); includes `lowThreshold` (null = no warning) |
| PUT | `/api/items/:id/homes` | Set designated home location(s) |
| DELETE | `/api/items/:id` | Soft delete: hidden everywhere, stickers freed, history kept; returns `{ eventId }` for Undo (DEC-013) |
| POST | `/api/items/:id/photos` | Upload multipart `photo` + `thumb`, already resized on the phone (DEC-006) |
| GET | `/api/photos/:file` | Serve a stored photo (immutable cache) |
| GET | `/api/stats` | `{ needsDetails, checkedOut, stale, low }` counts for the Inventory filter chips |

### Stock actions (each writes an Event in the same transaction and returns `{ eventId, item }` so the client can offer Undo)
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/stock/adjust` | `{ item_id, location_id, delta }` or `{ …, level }` | +/− use or add |
| POST | `/api/stock/recount` | `{ item_id, location_id, qty }` | Set the count, reset staleness. On a new location it adds the item there (`qty: null` = not counted yet) |
| POST | `/api/stock/move` | `{ item_id, from_location_id, to_location_id, qty? }` | Move some or all |
| POST | `/api/putback` | `{ itemId, locationId, unitId?, qty? }` | Put-back action. Adds it at the location (exact: +qty; level: just records the place); a unit moves to the location; the first put-back sets the home. Which item/bin is resolved in the client from `/api/scan` (one-part bin → +1, mixed bin → choose, item sticker → its home, warn if not a home) |

### Units (returnables)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/units` | Create a unit (with sticker code) for an item |
| POST | `/api/units/:id/move` | `{ toLocationId }` (undoable) |
| POST | `/api/units/:id/checkout` | `{ toLocationId?, note? }`: at least one. Undoable |
| POST | `/api/units/:id/checkin` | `{ locationId? }` defaults to the unit's home. Undoable. Put-back mode does this automatically when a checked-out unit is scanned |
| GET | `/api/units/checked-out` | Every unit out right now, longest-out first, with current place, note and home |

### Pins (F11)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/pins` | `{ items: ItemSummary[], locations: (LocationSummary & { path })[] }`, newest first |
| PUT / DELETE | `/api/pins/item/:id`, `/api/pins/location/:id` | Pin / unpin; returns the new list |

### Categories, events, system
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH | `/api/categories` | Manage categories + `field_defs` + defaults |
| GET | `/api/events?item=&location=&since=` | Activity log |
| POST | `/api/events/:id/undo` | Undo a recent action |
| GET | `/api/health` | Health check |
| any | `/api/*` (unknown) | JSON `404 NOT_FOUND`, never the web app's page |
| GET / POST | `/api/backup` | Last backup status / run a backup now (DEC-008) |

---

## Open Questions

- ~~Should `/api/putback` be a single endpoint?~~ Yes for the stock rules (tested server-side); the scan → which-item resolution lives in the client, since it's mostly UI state.
