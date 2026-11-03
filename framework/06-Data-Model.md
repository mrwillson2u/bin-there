# Data Model

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

The model is shaped by the user stories (J1–J8) and three key distinctions:

1. **Locations are a tree.** Rack → box/tote → bin, to any depth. Anything with a sticker is a location or a unit.
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
```

---

## Entities

### Location

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| parent_id | FK → Location, nullable | null = top level (e.g. a rack, "Garage") |
| type | enum LocationType | rack, gridded_box, tote, tub, bin, shelf, put_back, project, other |
| name | text | e.g. "Tote 4", "Screws box" |
| code | text, unique, nullable | Sticker ID |
| bin_size | text, nullable | 1x1, 2x1, 2x2, front_strip, other (bins only) |
| grid_cols / grid_rows | int, nullable | For gridded boxes: Allit case = 6 × 4 (+ front strip). Used by post-ship grid view |
| grid_x / grid_y | int, nullable | Bin position within parent box (post-ship grid view; nullable now) |
| notes, created_at, updated_at | | |

A special **Put-back bin** location (type `put_back`) exists by default. `project` type is reserved for post-ship project kits.

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
| low_threshold | int, nullable | exact mode, for later shopping list |
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
| actor | text, default "owner" | Ready for viewer roles later |

---

## Relationships Summary

| Relationship | Type | Notes |
|--------------|------|-------|
| Location → Location | tree | Moving a container moves everything under it (F9) by changing one parent_id |
| Item ↔ Location via Stock | many-to-many | Same item in several places (bin + project kit + put-back bin) |
| Item ↔ Location via ItemHome | many-to-many | Designated homes |
| Item → Unit | one-to-many | Stickered returnables |

---

## Enums / Lookup Tables

- **LocationType:** rack, gridded_box, tote, tub, bin, shelf, put_back, project, other
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

SQLite (WAL mode) via Drizzle ORM, with an FTS5 index over item name, category, attributes, supplier part # and notes. See DEC-004.

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
