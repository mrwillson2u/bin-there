import { describe, expect, it } from "vitest";
import { rackMove } from "./rack";

// A, B, C, D are ids 1, 2, 3, 4; 0 means an empty position in these pictures.
const row = (s: string) => s.split("").map((c) => (c === "." ? null : c.charCodeAt(0) - 64));
const show = (r: (number | null)[] | null) => (r ? r.map((v) => (v === null ? "." : String.fromCharCode(64 + v))).join("") : "full");

describe("rackMove (DEC-035)", () => {
  it("moves along everything between, like a list", () => {
    expect(show(rackMove(row("ABCD"), 4, 0))).toBe("DABC"); // D to the top: A, B, C each move down one
    expect(show(rackMove(row("ABCD"), 1, 2))).toBe("BCAD"); // A down to 3: B, C move up one
    expect(show(rackMove(row("ABCD"), 2, 1))).toBe("ABCD"); // dropped where it is
    expect(show(rackMove(row("AB.D"), 4, 1))).toBe("ADB."); // the gap moves along too
  });

  it("just fills an empty position", () => {
    expect(show(rackMove(row("A.CD"), 4, 1))).toBe("ADC.");
    expect(show(rackMove(row("A..."), 1, 3))).toBe("...A");
  });

  it("makes room for one coming in from outside the positions", () => {
    expect(show(rackMove(row("ABC."), 4, 0))).toBe("DABC"); // everything below moves down into the gap
    expect(show(rackMove(row("A.BC"), 4, 0))).toBe("DABC"); // only as far as the first gap
    expect(show(rackMove(row(".ABC"), 4, 3))).toBe("ABCD"); // dropped on C, no gap below: D takes 4, the ones above move up
    expect(show(rackMove(row("ABC"), 4, 1))).toBe("full");
  });

  it("takes one out, leaving its position empty", () => {
    expect(show(rackMove(row("ABC"), 2, null))).toBe("A.C");
    expect(rackMove(row("ABC"), 2, 5)).toBeNull();
  });
});
