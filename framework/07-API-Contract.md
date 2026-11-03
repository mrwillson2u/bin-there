# API Contract

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

An internal JSON API under `/api`, consumed only by the app's own React SPA. Request and response shapes are shared Zod schemas (DEC-004). There is no public API, versioning or rate limiting for the SPV.

## Authentication

None in the SPV: the app is reachable only on the tailnet (DEC-003). Later: Cloudflare Access identity header → role (owner/viewer); viewers are limited to GET.

## Error Handling

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
| GET | `/api/locations/:id` | Location + breadcrumb path + child locations + stock + units |
| POST | `/api/locations` | Create (optionally with `code`) |
| PATCH | `/api/locations/:id` | Edit; changing `parent_id` = **move container** (F9) |
| POST | `/api/locations/:id/code` | Assign a sticker code |

### Items
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/items?q=&category=&needs_details=` | Search (FTS) with total qty + every location path |
| GET | `/api/items/recently-used?days=30` | Items with a non-undone "use" in the last N days, most recent first (put-back suggestions) |
| GET | `/api/items/:id` | Item + stock by location + units + homes + recent events |
| POST | `/api/items` | Create. Used by quick capture: everything optional (`name`, `code` → returnable unit, `locationId`, `qty`/`level`, `categoryId`). Needs details unless it has a name **and** a category (DEC-007) |
| PATCH | `/api/items/:id` | Edit details (clears `needs_details` when complete) |
| PUT | `/api/items/:id/homes` | Set designated home location(s) |
| POST | `/api/items/:id/photos` | Upload multipart `photo` + `thumb`, already resized on the phone (DEC-006) |
| GET | `/api/photos/:file` | Serve a stored photo (immutable cache) |
| GET | `/api/stats` | `{ needsDetails }` count for the home screen |

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
| POST | `/api/units/:id/checkout` | `{ to_location_id, note }` |
| POST | `/api/units/:id/checkin` | `{ location_id? }` defaults to home |

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
| GET / POST | `/api/backup` | Last backup status / run a backup now (DEC-008) |

---

## Open Questions

- ~~Should `/api/putback` be a single endpoint?~~ Yes for the stock rules (tested server-side); the scan → which-item resolution lives in the client, since it's mostly UI state.
