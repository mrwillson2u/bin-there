import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, footprint, slotProblem, snapSlot, type PlacedBin } from "./grid";

const grid = DEFAULT_GRID;
const placed = (id: number, binSize: PlacedBin["binSize"], x: number, y: number, rotated = false): PlacedBin => ({ id, binSize, slot: { x, y, rotated } });

describe("grid helpers", () => {
  it("knows each bin's footprint, including a turned 2×1 and the full-width strip", () => {
    expect(footprint("1x1", false, grid)).toEqual({ w: 1, h: 1 });
    expect(footprint("2x1", false, grid)).toEqual({ w: 2, h: 1 });
    expect(footprint("2x1", true, grid)).toEqual({ w: 1, h: 2 });
    expect(footprint("2x2", true, grid)).toEqual({ w: 2, h: 2 });
    expect(footprint("front_strip", false, grid)).toEqual({ w: 6, h: 1 });
    expect(footprint(null, false, grid)).toEqual({ w: 1, h: 1 });
  });

  it("snaps to the drop cell when free, else the nearest free neighbour, else nowhere", () => {
    const others = [placed(1, "2x2", 0, 0)];
    expect(snapSlot("1x1", { x: 3, y: 3, rotated: false }, grid, others)).toEqual({ x: 3, y: 3, rotated: false });
    // Dropped on the blue 2×2: the closest free cell is one step right or down.
    const snapped = snapSlot("1x1", { x: 1, y: 1, rotated: false }, grid, others);
    expect(snapped && slotProblem("1x1", snapped, grid, others)).toBeNull();
    expect(snapped && Math.abs(snapped.x - 1) + Math.abs(snapped.y - 1)).toBe(1);
    // Boxed in: no free cell within reach.
    const crowded = [placed(1, "2x2", 0, 0), placed(2, "2x2", 2, 0), placed(3, "2x2", 0, 2), placed(4, "2x2", 2, 2)];
    expect(snapSlot("1x1", { x: 1, y: 1, rotated: false }, grid, crowded)).toBeNull();
    // Dropped past the right edge, a 2×1 slides back in.
    expect(snapSlot("2x1", { x: 5, y: 2, rotated: false }, grid, [])).toEqual({ x: 4, y: 2, rotated: false });
    // The strip only snaps to its own row, and only from near it.
    expect(snapSlot("front_strip", { x: 2, y: 3, rotated: false }, grid, [])).toEqual({ x: 0, y: 4, rotated: false });
    expect(snapSlot("front_strip", { x: 2, y: 0, rotated: false }, grid, [])).toBeNull();
    expect(snapSlot("1x1", { x: 2, y: 4, rotated: false }, grid, [])).toEqual({ x: 2, y: 3, rotated: false });
  });
});
