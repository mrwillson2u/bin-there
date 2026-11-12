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

/** Before printing stickers (DEC-052): which of these fresh codes are already on something. */
export const checkCodesSchema = z.object({ codes: z.array(codeSchema).max(5000) });
export type CodesCheck = { used: string[] };

/** Where a bin sits in its gridded box (x, y = top-left cell; y = rows means the front strip). Null takes it off the grid. */
export const placeBinSchema = z
  .object({ x: z.number().int().min(0).max(99), y: z.number().int().min(0).max(99), rotated: z.boolean().optional() })
  .nullable();
export type PlaceBin = z.infer<typeof placeBinSchema>;

export const tileViews = ["photos", "names"] as const;
export type TileView = (typeof tileViews)[number];

/** Racks and shelves can have numbered positions (DEC-034). */
export const holdsPositions = (type: LocationType) => type === "rack" || type === "shelf";
/** A position's label: its own, or its number (1-based). */
export const rackLabel = (labels: (string | null)[] | null | undefined, slot: number) => labels?.[slot] || String(slot + 1);
const rackSlot = z.number().int().min(0).max(199);

export const rackSizeSchema = z.object({ size: z.number().int().min(1).max(200).nullable() });
export const rackLabelsSchema = z.object({ labels: z.array(z.string().trim().max(20).nullable().transform((v) => v || null)).max(200) });
export const rackSlotSchema = z.object({ slot: rackSlot.nullable() });

export const gridSchema = z.object({ cols: z.number().int().min(1).max(12), rows: z.number().int().min(1).max(8) });

export const createLocationSchema = z.object({
  /** Optional for a bin: left out, it gets the next ID in the whole system ("Bin 0042", DEC-023). Everything else needs one. */
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(locationTypes),
  parentId: z.number().int().positive().nullable().optional(),
  code: codeSchema.nullable().optional(),
  binSize: z.enum(binSizes).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** For a bin in a gridded box: put it straight into this slot (DEC-020). */
  slot: placeBinSchema.optional(),
  /** For a rack or shelf: how many positions it has (DEC-034). */
  rackSize: z.number().int().min(1).max(200).nullable().optional(),
  /** Put it straight into this position of its parent (0-based). */
  rackSlot: rackSlot.nullable().optional(),
  /** For a gridded box: tiles show photos or names (DEC-036). */
  tileView: z.enum(tileViews).optional(),
  /** For a gridded box: its grid in cells, across × down (default 6 × 4, the Allit case; DEC-047). */
  grid: gridSchema.optional(),
});
export type CreateLocation = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.omit({ slot: true }).partial();
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

export const assignCodeSchema = z.object({
  code: codeSchema,
  /** If another location has this sticker, take it off that one (fixing a mix-up, DEC-022). Never takes one off an item. */
  move: z.boolean().optional(),
});

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
  /** A bin taken out of its box: where it went. Its spot on the grid stays saved (DEC-028). */
  out: BinOut | null;
  /** Which position of its parent it's in (0-based; DEC-034), and that position's label. */
  rackSlot: number | null;
  position: string | null;
  /** For a bin: the photo of the first part in it (A to Z) that has one, and that part's name, for its tile (DEC-036). */
  thumbUrl: string | null;
  thumbName: string | null;
  /** Every part in the bin with a photo, A to Z, up to six: a tile shows as many as it has cells (DEC-041). */
  thumbs: { url: string; name: string }[];
};

/**
 * One step of a path. `position` is the label of its position in the step before (DEC-034).
 * Paths from the server also say what each step is and, for a rack or shelf, how many
 * positions it has, so a screen can draw the step without another request (DEC-038).
 */
export type Crumb = { id: number; name: string; position?: string | null; type?: LocationType; rackSize?: number | null; rackSlot?: number | null };

/**
 * A position in words (DEC-038): a plain number is a level of its rack, "level 3"; a position
 * Colin has named ("Top") reads as it is.
 */
export const positionText = (position: string) => (/^\d+$/.test(position) ? `level ${position}` : position);

/** "level 3 · Grid box 1", or just the name: how a step of a path reads as text. */
export const crumbLabel = (c: Pick<Crumb, "name" | "position">) => (c.position ? `${positionText(c.position)} · ${c.name}` : c.name);

const byNumber = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
/**
 * Places in the order they sit (DEC-034): those in a position first, in position order, then the
 * rest by name, number-aware (Box 2 before Box 10).
 */
export function comparePlaces(a: { name: string; rackSlot?: number | null }, b: { name: string; rackSlot?: number | null }): number {
  const sa = a.rackSlot ?? null;
  const sb = b.rackSlot ?? null;
  if ((sa === null) !== (sb === null)) return sa === null ? 1 : -1;
  return (sa !== null && sb !== null ? sa - sb : 0) || byNumber.compare(a.name, b.name);
}

/** Where a bin taken out of its box is: a project kit, or just a note ("on the bench"). */
export type BinOut = { at: string; to: Crumb | null; note: string | null };

export type LocationDetail = LocationSummary & {
  parentId: number | null;
  /** The type of the place it's in. */
  parentType: LocationType | null;
  /** A rack or shelf with positions (DEC-034): how many, and labels (null = its number). */
  rack: { size: number; labels: (string | null)[] } | null;
  /** For a gridded box: whether its tiles show bins' photos or names (DEC-036). */
  tileView: TileView;
  notes: string | null;
  /** For a gridded box: its grid size (cells); null for every other type. */
  grid: Grid | null;
  path: Crumb[];
  children: LocationSummary[];
  items: LocationItem[];
  pinned: boolean;
  /** For a project kit: bins taken out of their boxes to this kit (they stay their box's children). */
  outHere: PinnedLocation[];
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

/** A detail filled in by AI (DEC-048): the page it came from (or "photo"), and when. */
export type AiFill = { source: string; at: string };
export const aiFieldsSchema = z.record(z.string().min(1).max(60), z.object({ source: z.string().max(1000), at: z.string().max(40) }));

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
    /**
     * Left out, a part stays on the Needs details list until it has a name and a category
     * (DEC-007, Q47). true keeps it there regardless.
     */
    needsDetails: z.boolean(),
    /** Which details were filled in by AI and where from (DEC-048); the whole map, replaced. */
    aiFields: aiFieldsSchema,
  })
  .partial();

// ---- AI data fill (DEC-048) ----

export type AiStatus = {
  /** AI_URL is set. */
  enabled: boolean;
  model: string | null;
  /** The model is downloaded and the server answers. */
  modelReady: boolean;
  /** SEARCH_URL is set. */
  search: boolean;
  /** The shops that can only be read through their API, and whether a key is set for each (DEC-049). */
  shops: { mouser: boolean; digikey: boolean };
};

export type Suggestion = {
  /** "name", "category", "supplier", "supplierPn", "price", "url", or "attributes.<key>". */
  field: string;
  label: string;
  value: string;
  /** Where it came from: a page URL, or "photo" for something read off the part. */
  source: string;
  confidence: "high" | "medium" | "low";
};

/**
 * What the form holds right now, sent with the look-up so a link just pasted in is read without
 * saving first (DEC-049). A field left out means "as saved"; an empty one means "none".
 */
export const researchSchema = z.object({
  /** "quick" (DEC-053): the photo alone, a likely name and category, no reading or searching. */
  mode: z.enum(["full", "quick"]).optional(),
  /** Another model on the same Ollama, for comparisons; the configured one otherwise. */
  model: z.string().trim().max(80).optional(),
  name: z.string().trim().max(200).optional(),
  url: z.string().trim().max(2000).nullable().optional(),
  supplier: z.string().trim().max(200).nullable().optional(),
  supplierPn: z.string().trim().max(200).nullable().optional(),
});
export type ResearchRequest = z.infer<typeof researchSchema>;

export type ResearchResult = {
  /** What the model thinks the part is, in a sentence. */
  identified: string;
  /** Text read off the part's photos (markings, labels, silkscreen). */
  markings: string[];
  queries: string[];
  /** Pages that were read. */
  sources: { title: string; url: string }[];
  suggestions: Suggestion[];
  /** Anything to tell Colin: "couldn't read the value", "two likely matches"... */
  notes: string[];
};
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
/** Take a bin out of its box (DEC-028): to a project kit, or with a note. */
export const takeOutSchema = z.object({ toLocationId: id.nullable().optional(), note: optText(200) });

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
  /** This place is a bin that's been taken out of its box, and where it is (DEC-028). */
  out: BinOut | null;
};

export type ItemSummary = {
  id: number;
  name: string;
  kind: ItemKind;
  tracking: TrackingMode;
  needsDetails: boolean;
  categoryId: number | null;
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

// ── Inventory: the home screen's list of every part ─────────────────────────

export const inventorySorts = ["name", "recent", "added"] as const;
export type InventorySort = (typeof inventorySorts)[number];
export const inventorySortLabels: Record<InventorySort, string> = { name: "Name", recent: "Last changed", added: "Newest first" };

const flag = z.literal("1").optional().transform((v) => v === "1");

/** GET /inventory query. Every filter narrows the list; with `q` and no `sort`, best matches come first. */
export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** A category id, or "none" for parts with no category. */
  cat: z.union([z.literal("none"), z.coerce.number().int().positive()]).optional(),
  kind: z.enum(itemKinds).optional(),
  needs: flag,
  low: flag,
  out: flag,
  stale: flag,
  sort: z.enum(inventorySorts).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export type Inventory = {
  /** Pinned parts that pass the filters, newest pin first. Only on the first page. */
  pinned: ItemSummary[];
  /** This page of everything else (pinned parts are never repeated here). */
  items: ItemSummary[];
  /** How many parts pass the filters, pinned ones included. */
  total: number;
  /** Offset of the next page, or null at the end. */
  next: number | null;
};

// ── Project kits (J4, DEC-019) ───────────────────────────────────────────────

/** An active project kit: a `project` location, wherever it sits in the tree. */
export type ProjectSummary = { id: number; name: string; path: Crumb[]; items: number; /** Bins taken out to this kit (DEC-028). */ bins: number; updatedAt: string };

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

/**
 * The square a photo shows as (DEC-030), as fractions of the original: `x` and `y` are the
 * square's left and top edges as a share of the photo's width and height, `size` its side as
 * a share of the photo's shorter side. Null = centred, as big as fits.
 */
export type PhotoCrop = { x: number; y: number; size: number };
export const photoCropSchema = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), size: z.number().min(0.1).max(1) })
  .strict();
/** `main`: the photo shown for the item in lists, tiles and the bin pane (DEC-031). Photos come main first. */
export type Photo = { id: number; url: string; thumbUrl: string; crop: PhotoCrop | null; main: boolean };
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
  fieldDefs: FieldDef[];
  /** Which details were filled in by AI and where from (DEC-048). */
  aiFields: Record<string, AiFill>;
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
