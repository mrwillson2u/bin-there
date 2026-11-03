import { z } from "zod";

// Shared request/response shapes between the server and the web app.

export const locationTypes = [
  "rack",
  "gridded_box",
  "tote",
  "tub",
  "bin",
  "shelf",
  "put_back",
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
  put_back: "Put-back bin",
  project: "Project kit",
  other: "Other",
};

export const binSizeLabels: Record<BinSize, string> = {
  "1x1": "1×1",
  "2x1": "2×1",
  "2x2": "2×2",
  front_strip: "Strip",
  other: "Other",
};

/** Sticker codes are trimmed; otherwise stored exactly as scanned. */
export const codeSchema = z.string().trim().min(1).max(64);

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
};

export type ScanResult =
  | { kind: "location"; location: LocationDetail }
  | { kind: "unit"; unitId: number; itemId: number }
  | { kind: "unassigned"; code: string };

export type ApiError = { error: { code: string; message: string } };
