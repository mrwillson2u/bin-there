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
| PUT | `/api/locations/:id/rack-size` | Body `{ size }` (1–200, or null to remove): a rack's or shelf's number of positions. First set-up fills them with what's inside, in name order; can't shrink past a position in use (409). DEC-034 |
| PUT | `/api/locations/:id/rack-labels` | Body `{ labels: (string\|null)[] }`: rename positions (blank keeps the number); two the same is a 409 |
| PUT | `/api/locations/:id/rack-slot` | Body `{ slot }` (0-based, or null): put this place in a position of the rack it's in; a taken position swaps the two. Returns the rack |
| POST | `/api/locations/:id/take-out` | Body `{ toLocationId?, note? }`: take a bin out of its box to a project kit or with a note (one is needed). It stays the box's child and keeps its slot; logged as `check_out` with no item. 409 if already out (DEC-028) |
| POST | `/api/locations/:id/put-back` | Put a bin that's out back (its saved slot, or unplaced if the spot was freed with `PUT …/slot` null); logged as `check_in`. 409 if it isn't out |
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
| PUT | `/api/photos/:id/crop` | Multipart `crop` (JSON `{ x, y, size }`, fractions of the original) + `thumb` (the square cut on the phone). Stores the crop, saves the thumbnail under a new name (names are cached forever) and deletes the old one; the original is untouched. Returns the item (DEC-030) |
| PUT | `/api/photos/:id/main` | Make this the item's main photo, the one shown in lists, tiles and the bin pane. Returns the item; its `photos` come main first (DEC-031) |
| DELETE | `/api/photos/:id` | Delete a photo and its files (backups keep their copies). Deleting the main one makes the next one main. Returns the item |
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

**Bins out of their box (DEC-028).** Every `LocationSummary` carries `out: { at, to: {id, name} | null, note } | null`. A project kit's `LocationDetail.outHere` lists the bins out to it (with paths), `ProjectSummary.bins` counts them, and each `Place` on an item carries the same `out` when that place is a bin that's out. Returning or finishing a kit puts its bins back; a kit with bins out to it can't be deleted.

**Rack positions (DEC-034).** A rack's `LocationDetail.rack` is `{ size, labels }` (null labels = their number). Every `LocationSummary` has `rackSlot` and `position` (that position's label); every `Crumb` in a path has `position`. Children come in position order, then by name. `POST /api/locations` takes `rackSize` (racks, shelves) and `rackSlot`; `PATCH` takes `rackSlot` with or without a new `parentId`. Activity text writes a step with a position as "3 · Grid box 1".
