import { z } from "zod";
import type { Grid, Slot } from "./grid";

// Shared request/response shapes between the server and the web app.

export const locationTypes = [
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
export type LocationType = (typeof locationTypes)[number];

export const binSizes = ["1x1", "2x1", "2x2", "front_strip", "other"] as const;
export type BinSize = (typeof binSizes)[number];

export const locationTypeLabels: Record<LocationType, string> = {
  site: "Site",
  rack: "Rack",
  gridded_box: "Gridded box",
  tote: "Tote",
  tub: "Tub",
  bin: "Bin",
  shelf: "Shelf",
  project: "Project kit",
  other: "Other",
};

/** Shown under the type picker so it's clear which to choose. */
export const locationTypeHints: Record<LocationType, string> = {
  site: "A place you keep things: the garage, basement, office, storage unit. Everything else goes inside a site.",
  rack: "A shelving unit that holds boxes and totes, like the Home Depot racks.",
  gridded_box: "An organizer case with a grid of removable bins, like the Allit cases. Add its bins inside it.",
  tote: "A lidded storage tote, like the yellow-lid totes. Things go straight in it, no grid.",
  tub: "An open container, bucket or tray without a lid or grid.",
  bin: "One bin inside a gridded box. Pick its size: red 1×1, yellow 2×1, blue 2×2, or the front strip.",
  shelf: "A shelf, drawer or spot on the bench where things sit loose.",
  project: "A kit for one project. Parts pulled into it remember their home, so they can all go back in one tap when you're done.",
  other: "Anything else: a cabinet, pegboard, toolbox…",
};

export const binSizeLabels: Record<BinSize, string> = {
  "1x1": "1×1",
  "2x1": "2×1",
  "2x2": "2×2",
  front_strip: "Strip",
  other: "Other",
};

// The scanner was set up years ago to append "&END!" to every code; strip it so
// a scanned sticker matches the same sticker read by the camera.
const scannerSuffixes = ["&END!"];

export function normalizeCode(raw: string): string {
  let code = raw.trim();
  for (const suffix of scannerSuffixes) {
    if (code.endsWith(suffix)) code = code.slice(0, -suffix.length).trim();
  }
  return code;
}

export const codeSchema = z.string().transform(normalizeCode).pipe(z.string().min(1).max(64));

/** Where a bin sits in its gridded box (x, y = top-left cell; y = rows means the front strip). Null takes it off the grid. */
export const placeBinSchema = z
  .object({ x: z.number().int().min(0).max(99), y: z.number().int().min(0).max(99), rotated: z.boolean().optional() })
  .nullable();
export type PlaceBin = z.infer<typeof placeBinSchema>;

export const createLocationSchema = z.object({
  /** Optional for a bin: left out, it's numbered within its box ("Bin 1", "Bin 2", …). Everything else needs one. */
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(locationTypes),
  parentId: z.number().int().positive().nullable().optional(),
  code: codeSchema.nullable().optional(),
  binSize: z.enum(binSizes).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** For a bin in a gridded box: put it straight into this slot (DEC-020). */
  slot: placeBinSchema.optional(),
});
export type CreateLocation = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.omit({ slot: true }).partial();
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

export const assignCodeSchema = z.object({ code: codeSchema });

export type LocationSummary = {
  id: number;
  name: string;
  type: LocationType;
  code: string | null;
  binSize: BinSize | null;
  /** For a bin in a gridded box: its slot on the grid, or null if not placed yet. */
  slot: Slot | null;
  childCount: number;
  /** How many different items are in here (not counting what's in child locations). */
  itemCount: number;
  /** The first couple of item names, so a bin can show what's in it instead of its number (DEC-020). */
  preview: string[];
};

export type Crumb = { id: number; name: string };

export type LocationDetail = LocationSummary & {
  parentId: number | null;
  notes: string | null;
  /** For a gridded box: its grid size (cells); null for every other type. */
  grid: Grid | null;
  path: Crumb[];
  children: LocationSummary[];
  items: LocationItem[];
  pinned: boolean;
};

export type PinnedLocation = LocationSummary & { path: Crumb[] };
export type Pins = { items: ItemSummary[]; locations: PinnedLocation[] };

export type ScanResult =
  | { kind: "location"; location: LocationDetail }
  | { kind: "unit"; unitId: number; itemId: number }
  | { kind: "unassigned"; code: string };

export type ApiError = { error: { code: string; message: string } };

// ── Items & stock (milestone 2) ──────────────────────────────────────────────

export const itemKinds = ["consumable", "returnable"] as const;
export type ItemKind = (typeof itemKinds)[number];
export const trackingModes = ["exact", "level"] as const;
export type TrackingMode = (typeof trackingModes)[number];
export const stockLevels = ["plenty", "low", "out"] as const;
export type StockLevel = (typeof stockLevels)[number];

export const itemKindLabels: Record<ItemKind, string> = { consumable: "Consumable", returnable: "Returnable" };
export const trackingLabels: Record<TrackingMode, string> = { exact: "Exact count", level: "Plenty / low / out" };
export const levelLabels: Record<StockLevel, string> = { plenty: "Plenty", low: "Low", out: "Out" };

const id = z.number().int().positive();
const qty = z.number().int().min(0).max(1_000_000);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Quick capture and full create share one shape; anything left out is filled in later. */
export const createItemSchema = z.object({
  name: z.string().trim().max(200).optional(),
  categoryId: id.nullable().optional(),
  kind: z.enum(itemKinds).optional(),
  tracking: z.enum(trackingModes).optional(),
  /** The item's own sticker: creates a returnable unit carrying that code. */
  code: codeSchema.optional(),
  locationId: id.optional(),
  qty: qty.optional(),
  level: z.enum(stockLevels).optional(),
});
export type CreateItem = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    categoryId: id.nullable(),
    kind: z.enum(itemKinds),
    tracking: z.enum(trackingModes),
    attributes: z.record(z.string().trim().min(1).max(50), z.string().trim().max(200)),
    price: z.number().min(0).max(1_000_000).nullable(),
    supplier: optText(200),
    supplierPn: optText(100),
    url: optText(1000),
    notes: optText(4000),
    /** Exact-count items: on the low-stock list once the total is at or below this. */
    lowThreshold: z.number().int().min(0).max(1_000_000).nullable(),
    /** Saving the details form clears "needs details" unless this is true. */
    needsDetails: z.boolean(),
  })
  .partial();
export type UpdateItem = z.infer<typeof updateItemSchema>;

export const setHomesSchema = z.object({ locationIds: z.array(id).max(50) });

export const adjustSchema = z.union([
  z.object({ itemId: id, locationId: id, delta: z.number().int().min(-1_000_000).max(1_000_000) }),
  z.object({ itemId: id, locationId: id, level: z.enum(stockLevels) }),
]);
export type Adjust = z.infer<typeof adjustSchema>;

/** Set the count (resets staleness). Also adds the item to a new place; qty null = not counted yet. */
export const recountSchema = z.object({ itemId: id, locationId: id, qty: qty.nullable().optional(), level: z.enum(stockLevels).optional() });
export type Recount = z.infer<typeof recountSchema>;

export const moveStockSchema = z.object({ itemId: id, fromLocationId: id, toLocationId: id, qty: qty.optional() });
export type MoveStock = z.infer<typeof moveStockSchema>;

export const createUnitSchema = z.object({ itemId: id, code: codeSchema, locationId: id.nullable().optional(), label: optText(100) });
export const moveUnitSchema = z.object({ toLocationId: id });

export const checkOutSchema = z.object({ toLocationId: id.nullable().optional(), note: optText(200) });
export const checkInSchema = z.object({ locationId: id.nullable().optional() });

export const putBackSchema = z.object({ itemId: id, locationId: id, unitId: id.optional(), qty: z.number().int().min(1).max(100_000).optional() });
export type PutBack = z.infer<typeof putBackSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultKind: z.enum(itemKinds).optional(),
  defaultTracking: z.enum(trackingModes).optional(),
  fields: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export type FieldDef = { key: string; label: string; type: "text" | "number" };

export type Category = {
  id: number;
  name: string;
  defaultKind: ItemKind;
  defaultTracking: TrackingMode;
  fieldDefs: FieldDef[];
};

/** One place an item is: bulk stock, stickered units, or both. */
export type Place = {
  locationId: number;
  path: Crumb[];
  /** Stock row present? (false = only units are here) */
  hasStock: boolean;
  /** Exact mode: null = not counted yet. */
  qty: number | null;
  level: StockLevel | null;
  units: number;
  isHome: boolean;
  stale: boolean;
  lastCountedAt: string | null;
};

export type ItemSummary = {
  id: number;
  name: string;
  kind: ItemKind;
  tracking: TrackingMode;
  needsDetails: boolean;
  categoryName: string | null;
  thumbUrl: string | null;
  /** Sum of counted stock + units; null when nothing is counted. */
  totalQty: number | null;
  /** Stickered units checked out right now (F10). */
  checkedOut: number;
  /** Exact-count items: low-stock warning level, or null for none. */
  lowThreshold: number | null;
  places: Place[];
};

/** A count that's worth checking again: old, or nudged a lot since it was last counted. */
export type ReviewEntry = {
  itemId: number;
  name: string;
  thumbUrl: string | null;
  locationId: number;
  path: Crumb[];
  qty: number;
  lastCountedAt: string;
  changesSinceCount: number;
};

export type Stats = { needsDetails: number; checkedOut: number; stale: number; low: number };

// ── Project kits (J4, DEC-019) ───────────────────────────────────────────────

/** An active project kit: a `project` location, wherever it sits in the tree. */
export type ProjectSummary = { id: number; name: string; path: Crumb[]; items: number; updatedAt: string };

/** Return one item (`itemId`) or everything in a kit to its home; `finish` also deletes the kit if that empties it. */
export const returnProjectSchema = z.object({ itemId: z.number().int().positive().optional(), finish: z.boolean().optional() });
export type ReturnProject = z.infer<typeof returnProjectSchema>;

export type ReturnResult = {
  /** Stock rows and units sent home. */
  returned: number;
  /** What's still in the kit and why it couldn't go home on its own. */
  left: { itemId: number; name: string; reason: string }[];
  /** The kit was deleted (only with `finish`, and only if nothing was left). */
  finished: boolean;
};

export type Photo = { id: number; url: string; thumbUrl: string };
export type Unit = {
  id: number;
  code: string | null;
  label: string | null;
  locationId: number | null;
  homeLocationId: number | null;
  path: Crumb[];
  /** Checked out (F10): to `path` if set, and/or with a note. */
  out: { at: string; note: string | null } | null;
};

/** A stickered unit that's out right now. */
export type CheckedOutUnit = {
  unitId: number;
  code: string | null;
  itemId: number;
  itemName: string;
  thumbUrl: string | null;
  path: Crumb[];
  homePath: Crumb[];
  at: string;
  note: string | null;
};

export type EventView = {
  id: number;
  at: string;
  type: string;
  itemId: number | null;
  itemName: string | null;
  location: string | null;
  from: string | null;
  to: string | null;
  delta: number | null;
  levelAfter: StockLevel | null;
  undone: boolean;
  canUndo: boolean;
};

export type ItemDetail = ItemSummary & {
  categoryId: number | null;
  fieldDefs: FieldDef[];
  attributes: Record<string, string>;
  price: number | null;
  supplier: string | null;
  supplierPn: string | null;
  url: string | null;
  notes: string | null;
  photos: Photo[];
  unitList: Unit[];
  history: EventView[];
  pinned: boolean;
};

/** An item as seen from inside a location. */
export type LocationItem = {
  itemId: number;
  name: string;
  thumbUrl: string | null;
  tracking: TrackingMode;
  needsDetails: boolean;
  hasStock: boolean;
  qty: number | null;
  level: StockLevel | null;
  units: number;
  stale: boolean;
  /** The item's first home (empty if it has none). Shown in project kits. */
  homePath: Crumb[];
};

export type BackupInfo = {
  enabled: boolean;
  last: { at: string; ok: boolean; snapshot: string | null; items: number; photos: number; error: string | null } | null;
};

/** Returned by every stock action so the client can offer Undo. */
export type StockResult = { eventId: number | null; item: ItemDetail };
