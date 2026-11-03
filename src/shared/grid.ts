import type { BinSize } from "./api";

// The gridded box layout (see framework/04-Visual-Style-Guide.md): a grid of
// square cells plus one full-width "front strip" row along the bottom. The strip
// row sits at y = rows and only takes a front_strip bin. Both the server and the
// web app use these helpers so what the screen allows is what the server accepts.

export const DEFAULT_GRID = { cols: 6, rows: 4 } as const;

/** Height of the strip row relative to a grid cell (46 mm strip vs 51 mm cell). */
export const STRIP_HEIGHT = 0.9;

export type Grid = { cols: number; rows: number };
export type Slot = { x: number; y: number; rotated: boolean };
export type Footprint = { w: number; h: number };

export function footprint(size: BinSize | null, rotated: boolean, grid: Grid): Footprint {
  switch (size) {
    case "2x1":
      return rotated ? { w: 1, h: 2 } : { w: 2, h: 1 };
    case "2x2":
      return { w: 2, h: 2 };
    case "front_strip":
      return { w: grid.cols, h: 1 };
    default:
      return { w: 1, h: 1 };
  }
}

export type PlacedBin = { id: number; binSize: BinSize | null; slot: Slot };

type Rect = { x: number; y: number; w: number; h: number };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Why a bin can't go in a slot, or null if it fits. `others` are the box's other
 * placed bins (the one being moved must be left out).
 */
export function slotProblem(size: BinSize | null, slot: Slot, grid: Grid, others: PlacedBin[]): string | null {
  const isStrip = size === "front_strip";
  const inStripRow = slot.y === grid.rows;
  if (isStrip && !inStripRow) return "The front strip only fits along the front";
  if (!isStrip && inStripRow) return "Only the front strip fits there";
  const { w, h } = footprint(size, slot.rotated, grid);
  if (slot.x < 0 || slot.y < 0 || slot.x + w > grid.cols || (!isStrip && slot.y + h > grid.rows)) {
    return "That doesn't fit inside the box";
  }
  const me = { x: slot.x, y: slot.y, w, h };
  for (const o of others) {
    const of = footprint(o.binSize, o.slot.rotated, grid);
    if (overlaps(me, { x: o.slot.x, y: o.slot.y, ...of })) return "Another bin is already there";
  }
  return null;
}

/**
 * The nearest free slot to where a bin was dropped, trying the drop cell first and
 * then its neighbours within `reach` cells. Null if nothing fits that close.
 */
export function snapSlot(size: BinSize | null, want: Slot, grid: Grid, others: PlacedBin[], reach = 1): Slot | null {
  if (size === "front_strip") {
    const strip = { x: 0, y: grid.rows, rotated: false };
    return Math.abs(want.y - grid.rows) <= reach && slotProblem(size, strip, grid, others) === null ? strip : null;
  }
  const candidates: Slot[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const s = { x: want.x + dx, y: want.y + dy, rotated: want.rotated };
      if (s.y >= grid.rows) continue;
      candidates.push(s);
    }
  }
  candidates.sort((a, b) => dist(a, want) - dist(b, want));
  return candidates.find((s) => slotProblem(size, s, grid, others) === null) ?? null;
}

function dist(a: Slot, b: Slot): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
