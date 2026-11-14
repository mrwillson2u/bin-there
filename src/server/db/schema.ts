import type { StoredResearch } from "../../shared/api";
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  real,
  primaryKey,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// See framework/06-Data-Model.md for the reasoning behind each entity.

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
};

export const LOCATION_TYPES = [
  "site",
  "rack",
  "gridded_box",
  "tote",
  "tub",
  "bin",
  "shelf",
  "project",
  "other",
] as const;

export const BIN_SIZES = ["1x1", "2x1", "2x2", "front_strip", "other"] as const;

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id").references((): AnySQLiteColumn => locations.id),
  type: text("type", { enum: LOCATION_TYPES }).notNull(),
  name: text("name").notNull(),
  code: text("code").unique(),
  binSize: text("bin_size", { enum: BIN_SIZES }),
  gridCols: integer("grid_cols"),
  gridRows: integer("grid_rows"),
  gridX: integer("grid_x"),
  gridY: integer("grid_y"),
  // A 2×1 bin can sit either way in the grid; rotated = tall (1 wide, 2 high).
  gridRotated: integer("grid_rotated", { mode: "boolean" }).notNull().default(false),
  // A bin taken out of its box (DEC-028): it stays the box's child and keeps its grid spot.
  // out_at set = out; out_to_id is the project kit it went to (or null with just a note).
  outAt: text("out_at"),
  outToId: integer("out_to_id").references((): AnySQLiteColumn => locations.id),
  outNote: text("out_note"),
  // A rack or shelf with numbered positions (DEC-034): how many, and any labels other than
  // the default 1, 2, 3… (null entries keep the number).
  rackSize: integer("rack_size"),
  rackLabels: text("rack_labels", { mode: "json" }).$type<(string | null)[]>(),
  // Which of its parent's positions it's in (0-based), or null for "not in a position".
  rackSlot: integer("rack_slot"),
  // A gridded box's tiles show each bin's photo or its name (DEC-036). Null = photos.
  tileView: text("tile_view", { enum: ["photos", "names"] }),
  notes: text("notes"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const ITEM_KINDS = ["consumable", "returnable"] as const;
export const TRACKING_MODES = ["exact", "level"] as const;
export const STOCK_LEVELS = ["plenty", "low", "out"] as const;

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id),
  name: text("name").notNull(),
  defaultKind: text("default_kind", { enum: ITEM_KINDS }).notNull().default("consumable"),
  defaultTracking: text("default_tracking", { enum: TRACKING_MODES }).notNull().default("exact"),
  fieldDefs: text("field_defs", { mode: "json" }).$type<FieldDef[]>().notNull().default([]),
});

/**
 * A field in a category's template. `key` is the field's ID ("f12", DEC-071), never its name.
 * `perUnit` (DEC-062): each stickered unit holds its own value, not the part.
 */
export type FieldDef = { key: string; label: string; type: "text" | "number" | "choice"; options?: string[]; perUnit?: boolean };

/**
 * Every category field, once (DEC-071), owned by its one category (DEC-072). A part's custom
 * fields aren't here: `items.custom`.
 */
export const fields = sqliteTable("fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references((): AnySQLiteColumn => categories.id),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  kind: text("kind", { enum: ITEM_KINDS }).notNull().default("consumable"),
  tracking: text("tracking", { enum: TRACKING_MODES }).notNull().default("exact"),
  /** Values of category fields, by field key ("f12", DEC-071): the part's, whatever category it's in now. */
  attributes: text("attributes", { mode: "json" }).$type<Record<string, string | number>>().notNull().default({}),
  /** Custom fields (DEC-071): on this part only, by name. */
  custom: text("custom", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  price: real("price"),
  supplier: text("supplier"),
  supplierPn: text("supplier_pn"),
  url: text("url"),
  needsDetails: integer("needs_details", { mode: "boolean" }).notNull().default(false),
  lowThreshold: integer("low_threshold"),
  notes: text("notes"),
  // Which details were filled in by AI and where from (DEC-048): keys like "price",
  // "supplier", "attributes.Value"; each with the page (or "photo") and when.
  aiFields: text("ai_fields", { mode: "json" }).$type<Record<string, { source: string; at: string }>>().notNull().default({}),
  // The AI look-up queue (DEC-055): the part's place in it, and the last look-up's answer kept for review.
  aiJob: text("ai_job").$type<"queued" | "running" | "failed">(),
  aiJobAt: text("ai_job_at"),
  aiJobError: text("ai_job_error"),
  aiResult: text("ai_result", { mode: "json" }).$type<StoredResearch>(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const stock = sqliteTable(
  "stock",
  {
    itemId: integer("item_id").notNull().references(() => items.id),
    locationId: integer("location_id").notNull().references(() => locations.id),
    qty: integer("qty"),
    level: text("level", { enum: STOCK_LEVELS }),
    lastCountedAt: text("last_counted_at").notNull().default(sql`(datetime('now'))`),
    changesSinceCount: integer("changes_since_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locationId] })],
);

export const itemHomes = sqliteTable(
  "item_homes",
  {
    itemId: integer("item_id").notNull().references(() => items.id),
    locationId: integer("location_id").notNull().references(() => locations.id),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locationId] })],
);

export const UNIT_STATUSES = ["home", "checked_out", "lost", "retired"] as const;

export const units = sqliteTable("units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => items.id),
  code: text("code").unique(),
  label: text("label"),
  locationId: integer("location_id").references(() => locations.id),
  homeLocationId: integer("home_location_id").references(() => locations.id),
  status: text("status", { enum: UNIT_STATUSES }).notNull().default("home"),
  checkedOutAt: text("checked_out_at"),
  checkedOutNote: text("checked_out_note"),
  /** Values of the category's per-unit fields (DEC-062), by field key. */
  attributes: text("attributes", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

export const photos = sqliteTable("photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").references(() => items.id),
  locationId: integer("location_id").references(() => locations.id),
  path: text("path").notNull(),
  thumbPath: text("thumb_path"),
  // The square shown everywhere (DEC-030), as fractions of the original: left and top edges of
  // its width and height, and the side as a share of its shorter side. Null = centred, full.
  cropX: real("crop_x"),
  cropY: real("crop_y"),
  cropSize: real("crop_size"),
  // The photo shown for the item everywhere (DEC-031). None marked = the oldest.
  isMain: integer("is_main", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamps.createdAt,
});

export const EVENT_TYPES = [
  "add",
  "use",
  "adjust",
  "recount",
  "move",
  "check_out",
  "check_in",
  "put_back",
  "create",
  "assign_code",
  "archive",
  /** A stickered unit removed from its part (DEC-063): retired, its sticker freed. */
  "retire",
  "undo",
] as const;

export type StockRow = typeof stock.$inferSelect;
export type UndoData = {
  stock?: { itemId: number; locationId: number; row: StockRow | null }[];
  units?: {
    id: number;
    locationId: number | null;
    /** Its home before, when the event moved that too (a bulk move, DEC-057). */
    homeLocationId?: number | null;
    /** Check-out state, for check-out/check-in events. */
    out?: { status: (typeof UNIT_STATUSES)[number]; checkedOutAt: string | null; checkedOutNote: string | null };
  }[];
  /** The item's home locations before the event. */
  homes?: number[];
  /** For an item archive: the units as they were, so Undo can bring the item back. */
  archive?: { units: { id: number; code: string | null; status: (typeof UNIT_STATUSES)[number] }[] };
  /** For a unit removed from its part (DEC-063): as it was, so Undo can bring it back. */
  retire?: { id: number; code: string | null; status: (typeof UNIT_STATUSES)[number] };
};

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull().default(sql`(datetime('now'))`),
  type: text("type", { enum: EVENT_TYPES }).notNull(),
  itemId: integer("item_id").references(() => items.id),
  unitId: integer("unit_id").references(() => units.id),
  locationId: integer("location_id").references(() => locations.id),
  fromLocationId: integer("from_location_id").references(() => locations.id),
  toLocationId: integer("to_location_id").references(() => locations.id),
  delta: integer("delta"),
  levelAfter: text("level_after", { enum: STOCK_LEVELS }),
  undoneBy: integer("undone_by").references((): AnySQLiteColumn => events.id),
  /** Rows as they were before this event, so it can be undone exactly. */
  undoData: text("undo_data", { mode: "json" }).$type<UndoData>(),
  actor: text("actor").notNull().default("owner"),
});

/** Things pinned to the top of the Garage screen for quick access (F11). Exactly one of item/location is set. */
export const pins = sqliteTable("pins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").unique().references(() => items.id, { onDelete: "cascade" }),
  locationId: integer("location_id").unique().references(() => locations.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
