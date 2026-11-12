import { describe, expect, it } from "vitest";
import { nextName } from "./names";

describe("nextName (DEC-058)", () => {
  it("counts the number at the end up, keeping its padding", () => {
    expect(nextName("Mini tote 1")).toBe("Mini tote 2");
    expect(nextName("Shelf 03")).toBe("Shelf 04");
    expect(nextName("Shelf 09")).toBe("Shelf 10");
    expect(nextName("Shelf 99")).toBe("Shelf 100");
    expect(nextName("Tote A1")).toBe("Tote A2");
    expect(nextName("Bin12")).toBe("Bin13");
    expect(nextName("Tote 4 ")).toBe("Tote 5");
  });
  it("adds a 2 to a name with no number at the end", () => {
    expect(nextName("Mini tote")).toBe("Mini tote 2");
    expect(nextName("Rack B")).toBe("Rack B 2");
  });
});
