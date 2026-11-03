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

export type FieldDef = { key: string; label: string; type: "text" | "number" };

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  kind: text("kind", { enum: ITEM_KINDS }).notNull().default("consumable"),
  tracking: text("tracking", { enum: TRACKING_MODES }).notNull().default("exact"),
  attributes: text("attributes", { mode: "json" }).$type<Record<string, string | number>>().notNull().default({}),
  price: real("price"),
  supplier: text("supplier"),
  supplierPn: text("supplier_pn"),
  url: text("url"),
  needsDetails: integer("needs_details", { mode: "boolean" }).notNull().default(false),
  lowThreshold: integer("low_threshold"),
  notes: text("notes"),
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
  ...timestamps,
});

export const photos = sqliteTable("photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").references(() => items.id),
  locationId: integer("location_id").references(() => locations.id),
  path: text("path").notNull(),
  thumbPath: text("thumb_path"),
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
  "undo",
] as const;

export type StockRow = typeof stock.$inferSelect;
export type UndoData = {
  stock?: { itemId: number; locationId: number; row: StockRow | null }[];
  units?: { id: number; locationId: number | null }[];
  /** The item's home locations before the event. */
  homes?: number[];
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
