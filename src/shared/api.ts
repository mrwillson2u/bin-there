import { z } from "zod";

// Shared request/response shapes between the server and the web app.

export const locationTypes = [
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
  rack: "A shelving unit that holds boxes and totes, like the Home Depot racks.",
  gridded_box: "An organizer case with a grid of removable bins, like the Allit cases. Add its bins inside it.",
  tote: "A lidded storage tote, like the yellow-lid totes. Things go straight in it, no grid.",
  tub: "An open container, bucket or tray without a lid or grid.",
  bin: "One bin inside a gridded box. Pick its size: red 1×1, yellow 2×1, blue 2×2, or the front strip.",
  shelf: "A shelf, drawer or spot on the bench where things sit loose.",
  project: "A temporary kit for a project (coming after launch).",
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

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(locationTypes),
  parentId: z.number().int().positive().nullable().optional(),
  code: codeSchema.nullable().optional(),
  binSize: z.enum(binSizes).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateLocation = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

export const assignCodeSchema = z.object({ code: codeSchema });

export type LocationSummary = {
  id: number;
  name: string;
  type: LocationType;
  code: string | null;
  binSize: BinSize | null;
  childCount: number;
};

export type Crumb = { id: number; name: string };

export type LocationDetail = LocationSummary & {
  parentId: number | null;
  notes: string | null;
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
  places: Place[];
};

export type Photo = { id: number; url: string; thumbUrl: string };
export type Unit = {
  id: number;
  code: string | null;
  label: string | null;
  locationId: number | null;
  homeLocationId: number | null;
  path: Crumb[];
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
};

export type BackupInfo = {
  enabled: boolean;
  last: { at: string; ok: boolean; snapshot: string | null; items: number; photos: number; error: string | null } | null;
};

/** Returned by every stock action so the client can offer Undo. */
export type StockResult = { eventId: number | null; item: ItemDetail };
