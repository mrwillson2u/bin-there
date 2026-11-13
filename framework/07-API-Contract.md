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
| PUT | `/api/locations/:id/rack-slot` | Body `{ slot }` (0-based, or null): put this place in a position of the rack it's in. On a taken position the ones in between move along; from outside the positions, the rest make room down (or up) into the nearest empty one; 409 when every position is in use (DEC-035, `rackMove` in `src/shared/rack.ts`). Returns the rack |
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
| GET | `/api/items/needs-details` | Every part on the Needs details list, oldest first, as full `ItemDetail`s, for the Fill in details page (DEC-037) |
| GET | `/api/items/low` | The shopping list: level items low/out anywhere, exact items at zero or at/below their `lowThreshold`; worst first (DEC-016) |
| GET | `/api/review` | Stale exact counts (`ReviewEntry[]`: item, location path, qty, last counted, changes since), in walking order by location (DEC-015) |
| GET | `/api/items/:id` | Item + stock by location + units + homes + recent events |
| POST | `/api/items` | Create. Used by quick capture: everything optional (`name`, `code` → returnable unit, `locationId`, `qty`/`level`, `categoryId`). Needs details unless it has a name **and** a category (DEC-007) |
| PATCH | `/api/items/:id` | Edit details, any subset of fields; includes `lowThreshold` (null = no warning). Afterwards the part needs details unless it has a name and a category (DEC-007, DEC-037); sending `needsDetails: true` keeps it on the list anyway. Switching `tracking` converts the stock |
| PUT | `/api/items/:id/homes` | Set designated home location(s) |
| DELETE | `/api/items/:id` | Soft delete: hidden everywhere, stickers freed, history kept; returns `{ eventId }` for Undo (DEC-013) |
| POST | `/api/items/bulk` | Bulk editing (DEC-057): `{ ids, action }` with `action` one of `{ type: "category", categoryId }` (null clears), `{ type: "move", locationId }` (everything each part has goes there, one undoable entry per part), `{ type: "tracking", tracking }`, `{ type: "delete" }`. Each part on its own; `{ done, failed: [{ id, name, message }] }` back |
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
| PATCH | `/api/units/:id` | A stickered unit's own details (DEC-062): `{ attributes }`, the whole map of the category's per-unit fields' values by key, replaced; blanks dropped. Not a stock change: no event, no Undo. `ItemDetail` back (each `unitList` entry carries `attributes`) |
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
| PATCH | `/api/locations/:id` with `grid: { cols, rows }` | A gridded box's grid size (1–12 × 1–8); `409 CONFLICT` naming any placed bin that wouldn't fit; the front strip follows the new front row (DEC-047). `grid` is also taken on create |
| GET | `/api/ai/status` | `{ enabled, model, modelReady, search, shops: { mouser, digikey } }`: AI data fill is on when `AI_URL` is set; the shop flags say whether a Mouser / Digi-Key API key is set (DEC-048, DEC-049; `ai` branch) |
| POST | `/api/stickers/check` | Print stickers (DEC-052): `{ codes: string[] }` (up to 5000) → `{ used: string[] }`, the ones already on a location or a unit. The codes themselves are drawn on the device and never recorded. |
| GET | `/api/categories/:id/values` | Per text field key, the values the category's parts already hold, most used first, at most 30 (DEC-060). |
| GET | `/api/categories/usage` | Per category id (DEC-056): `{ items, fields: { [key]: parts holding a value } }`. |
| PATCH | `/api/categories/:id` | Edit a category (DEC-056): `name?`, `defaultKind?`, `defaultTracking?`, `fieldDefs?: [{ key?, label, type?, options? }]` (a field with its key is renamed/moved, one without is new, fields left out are removed; `type` is `text` or `choice`, left out it keeps its type; `options` are a choice field's options in order, DEC-059; `perUnit: true` makes it a per-unit field, held by each stickered unit instead of the part, left out it keeps its setting, DEC-062). `409` on a name clash. `Category` back. |
| DELETE | `/api/categories/:id` | Delete a category no part uses; `409` with the count while parts use it. |
| POST | `/api/items/:id/research/queue` | Queue the part for the AI look-up (DEC-055): worked one at a time in the background; `ItemDetail` back, with `aiJob` (`queued` / `running` / `failed`, `at`, `error`). `400` when AI isn't set up. |
| DELETE | `/api/items/:id/research/queue` | Cancel the part's queued or running look-up (a running one finishes and its answer is thrown away). `ItemDetail` back. |
| DELETE | `/api/items/:id/research` | Dismiss the stored answer (`aiResult`) and any job. `ItemDetail` back. |
| POST | `/api/items/:id/research` | AI data fill: `ResearchResult` with `identified`, `markings`, `queries`, `sources`, `suggestions[]` (`field`, `label`, `value`, `source`, `confidence`) and `notes`. Writes nothing to the part's details, but keeps its answer on the part as `aiResult` (with `at` and `mode`) for review (DEC-055); `400` when AI isn't set up. Optional body `{ mode?, name?, url?, supplier?, supplierPn? }`: the form's current values, used instead of the saved ones (a pasted link is read without saving first); `mode: "quick"` (DEC-053) is the photo alone, one model call, a likely name and category, nothing read or searched; `model` names another model on the same Ollama for comparisons. Reads the part's `url` first, else the shop page for `supplier` + `supplierPn` (Adafruit, SparkFun, LCSC, Amazon by fetch; Mouser and Digi-Key by API key), else a link printed on the part, and only searches the web when none could be read (DEC-049). Takes 10–60 s |
| PATCH | `/api/items/:id` with `aiFields` | Which details were filled in by AI and where from: `{ "<field>": { source, at } }`, replaced whole (DEC-048) |
| GET | `/api/changes` | Server-sent events: a `change` event `{ version, by }` first (where the server is now) and then one per successful write; `by` is the writer's `X-Client` header, which every write from the app sends, so a screen can ignore its own echo (DEC-046) |
| any | `/api/*` (unknown) | JSON `404 NOT_FOUND`, never the web app's page |
| GET / POST | `/api/backup` | Last backup status / run a backup now (DEC-008) |

---

## Open Questions

- ~~Should `/api/putback` be a single endpoint?~~ Yes for the stock rules (tested server-side); the scan → which-item resolution lives in the client, since it's mostly UI state.

**Bins out of their box (DEC-028).** Every `LocationSummary` carries `out: { at, to: {id, name} | null, note } | null`. A project kit's `LocationDetail.outHere` lists the bins out to it (with paths), `ProjectSummary.bins` counts them, and each `Place` on an item carries the same `out` when that place is a bin that's out. Returning or finishing a kit puts its bins back; a kit with bins out to it can't be deleted.

**Bin tile photos (DEC-036, DEC-041).** Every `LocationSummary` for a bin has `thumbUrl`/`thumbName` (the main photo of its first part, A to Z, with one) and `thumbs`, every part in it with a photo (`{ url, name }`, A to Z, up to six), so a tile can show one square photo per cell.

**Rack positions (DEC-034).** A rack's `LocationDetail.rack` is `{ size, labels }` (null labels = their number). Every `LocationSummary` has `rackSlot` and `position` (that position's label); every `Crumb` in a path has `position`, and (DEC-038) `type`, `rackSize` (racks and shelves) and `rackSlot`, so a screen can draw the walk to a place. Children come in position order, then by name. `POST /api/locations` takes `rackSize` (racks, shelves) and `rackSlot`; `PATCH` takes `rackSlot` with or without a new `parentId`. Activity text writes a step with a numbered position as "level 3 · Grid box 1" (a named one as "Top · Grid box 1"; `positionText`, DEC-038).

**Bin tiles (DEC-036).** A bin's `LocationSummary` carries `thumbUrl` and `thumbName`: the main photo of the first part in it (A to Z) that has one, and that part's name. A gridded box's `LocationDetail.tileView` is `photos` (default) or `names`, set with `PATCH /api/locations/:id` `{ tileView }`.
