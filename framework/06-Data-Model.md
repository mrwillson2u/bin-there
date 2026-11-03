# Data Model

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

The model is shaped by the user stories (J1–J8) and three key distinctions:

1. **Locations are a tree.** Site → rack → box/tote → bin, to any depth. **Sites** (garage, basement, office…) are the only top-level locations (DEC-010). Anything with a sticker is a location or a unit.
2. **Bulk stock vs. individual units.** Consumables and sticker-less small parts are **stock** (a quantity or level of an item *at a location*). Stickered returnables are **units** (each physical thing is its own record with its own sticker).
3. **One item model, not a table per part type.** Type-specific fields (thread, resistor value…) live in a JSON `attributes` field whose allowed fields are defined per **category**. This avoids repeating the Airtable sprawl.

Every change to stock or units writes an **event** (activity log): for undo, staleness, history ("where was this used?"), and the success metrics.

---

## Entity Relationship Diagram

```
Category 1──* Item 1──* Stock *──1 Location ──┐ parent (self, tree)
                 │                    ▲       │
                 │ 1──* Unit ─────────┤ current_location, home_location
                 │ 1──* ItemHome ─────┘ (designated home(s) for bulk items)
                 │ 1──* Photo
 Event (activity log) → references item / unit / location(s)
 Sticker code: unique; on Location.code or Unit.code (pre-printed IDs, assigned on first scan)
   Sticker format (confirmed 2026-11-02): the QR holds only a 12-character random ID, letters + digits (e.g. HnVbi6RSP4ar), no prefix or URL. Recognize a sticker as ^[A-Za-z0-9]{12}$ with at least one letter, so a 12-digit UPC-A product barcode is never mistaken for one.
```

---

## Entities

### Location

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| parent_id | FK → Location, nullable | null = top level (e.g. a rack, "Garage") |
| type | enum LocationType | site, rack, gridded_box, tote, tub, bin, shelf, project, other |
| name | text | e.g. "Tote 4", "Screws box" |
| code | text, unique, nullable | Sticker ID |
| bin_size | text, nullable | 1x1, 2x1, 2x2, front_strip, other (bins only) |
| grid_cols / grid_rows | int, nullable | For gridded boxes. Null means the Allit case, 6 × 4 (+ front strip), which is the only one so far (DEC-014) |
| grid_x / grid_y | int, nullable | A bin's top-left cell in its parent box; null = not placed on the grid yet. `grid_y = grid_rows` is the front-strip row. Cleared when the bin moves to another box or changes size |
| grid_rotated | boolean | A 2×1 bin standing tall (1 wide, 2 high). Migration 0007 |
| notes, created_at, updated_at | | |

The put-back bin is **physical only** (DEC-009): the app doesn't track what's in it, and the old built-in location was deleted (migration 0004). `project` type is a **project kit** (DEC-019, built 2026-11-03): a temporary location parts are pulled into. It never appears in `item_homes` or as a unit's `home_location_id`, which is what lets "return everything" send things back.

### Category

| Field | Type | Notes |
|-------|------|-------|
| id, name | | e.g. Fasteners › Screws, Electronics › ICs. Optional parent_id for a light hierarchy |
| default_kind | enum ItemKind | consumable / returnable |
| default_tracking | enum TrackingMode | exact / level (DEC-001) |
| field_defs | JSON | e.g. `[{key:"thread",label:"Thread",type:"text"},{key:"length_mm",type:"number"}]` |

### Item (a kind of thing)

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| name | text | "M3 × 10 socket head, stainless" |
| category_id | FK, nullable | null allowed during quick capture |
| kind | enum ItemKind | consumable / returnable |
| tracking | enum TrackingMode | exact / level; default from category |
| attributes | JSON | Values for the category's `field_defs` |
| price, supplier, supplier_pn, url | nullable | |
| needs_details | boolean | true after quick capture until filled in |
| low_threshold | int, nullable | exact mode: on the low-stock list once the total is at or below this (DEC-016). Set on the edit screen |
| notes, created_at, updated_at | | |

### Stock (bulk quantity of an item at a location)

| Field | Type | Notes |
|-------|------|-------|
| item_id, location_id | composite PK | |
| qty | int, nullable | exact mode |
| level | enum StockLevel, nullable | level mode: plenty / low / out |
| last_counted_at | datetime | Set on add/recount; drives staleness |
| changes_since_count | int | Increments on use; part of the staleness rule |

### ItemHome

| Field | Type | Notes |
|-------|------|-------|
| item_id, location_id | composite PK | Designated home(s) for an item: "where it lives". Supports items with several homes (put-back disambiguation) |

### Unit (individually tracked returnable)

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| item_id | FK → Item | e.g. item "12 V 2 A power supply" |
| code | text, unique, nullable | Its own sticker |
| label | text, nullable | e.g. "#3" |
| location_id | FK → Location | Where it is now |
| home_location_id | FK → Location | Where it lives |
| status | enum UnitStatus | home / checked_out / lost / retired |
| checked_out_at, checked_out_note | nullable | e.g. "Synth build" |

### Photo

| Field | Type | Notes |
|-------|------|-------|
| id, item_id (or location_id), path, thumb_path, created_at | | Files under `/data/photos` |

### Event (activity log, append-only)

| Field | Type | Notes |
|-------|------|-------|
| id, at | | |
| type | enum EventType | add, use, adjust, recount, move, check_out, check_in, put_back, create, assign_code, undo |
| item_id, unit_id, from_location_id, to_location_id | nullable | |
| delta / level_after | nullable | |
| undone_by | FK → Event, nullable | |
| undo_data | JSON, nullable | Stock rows / unit locations / homes as they were before the event. Undo restores them exactly. Only an item's latest change can be undone, so undo never overwrites a later change |
| actor | text, default "owner" | Ready for viewer roles later |

---

## Relationships Summary

| Relationship | Type | Notes |
|--------------|------|-------|
| Location → Location | tree | Moving a container moves everything under it (F9) by changing one parent_id |
| Item ↔ Location via Stock | many-to-many | Same item in several places (bin + another bin + project kit) |
| Item ↔ Location via ItemHome | many-to-many | Designated homes |
| Item → Unit | one-to-many | Stickered returnables |

---

## Enums / Lookup Tables

- **LocationType:** site, rack, gridded_box, tote, tub, bin, shelf, project, other
- **ItemKind:** consumable, returnable
- **TrackingMode:** exact, level
- **StockLevel:** plenty, low, out
- **UnitStatus:** home, checked_out, lost, retired
- **EventType:** see Event

---

## Data Lifecycle

- **Retention:** keep everything; events are small. No GDPR concerns (personal data only).
- **Deletion:** items/locations are soft-deleted (archived) so history stays readable.

---

## Database Choice

SQLite (WAL mode) via Drizzle ORM, with an FTS5 index (`items_fts`, rowid = item id) over item name, category, attributes, supplier, supplier part #, notes and unit sticker codes, rewritten by the app on every item change. Every search word must match the start of a word ("m3 10" finds "M3 x 10mm"). See DEC-004.

**Rules settled in M2:** an exact count is *stale* after 90 days or 10 changes since the last count. A sticker given at capture makes the item returnable with one unit. Moving *all* of an item out of a home moves the home along (reorganizing); a partial move doesn't. Switching an item between exact and level converts its stock (qty > 0 → plenty, 0 → out; level → "not counted").

---

## Migrations Strategy

Drizzle Kit migrations committed to the repo; applied automatically on container start (after an automatic pre-migration backup).

---

## Sample Queries

### "Where are all my M3 screws?"
FTS search on items → join Stock and Unit → for each location, walk the parent chain (recursive CTE) to build "Rack A → Box 3 → Bin 7".

### Staleness
`Stock where tracking = exact and (last_counted_at < now − N days or changes_since_count > K)`. *[TBD: N and K defaults, e.g. 180 days / 10 changes]*

---

## Open Questions

- Staleness thresholds (N days, K changes): tune after real use.
- Can a sticker-less returnable (a small module) be checked out? *Proposed: yes, as bulk stock moving from its bin to the project location, logged as check_out.*
