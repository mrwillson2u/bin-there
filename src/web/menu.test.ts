import { describe, expect, it } from "vitest";
import { menuOrder, moveMenuItem } from "./menu";

describe("the menu's order (issue #3)", () => {
  const usual = ["inventory", "locations", "search", "putback", "activity", "categories", "stickers", "settings"];
  it("is the usual order with nothing saved, or with rubbish saved", () => {
    expect(menuOrder(null)).toEqual(usual);
    expect(menuOrder("x")).toEqual(usual);
    expect(menuOrder(["nope", 3])).toEqual(usual);
  });
  it("keeps a saved order, and gives an entry it doesn't know a place by its usual neighbour", () => {
    expect(menuOrder(["settings", "inventory", "locations", "putback", "activity", "categories", "stickers"])).toEqual(["settings", "inventory", "locations", "search", "putback", "activity", "categories", "stickers"]);
    const partial = menuOrder(["search", "search", "inventory"]);
    expect(partial[0]).toBe("search");
    expect([...partial].sort()).toEqual([...usual].sort());
    expect(partial.indexOf("locations")).toBe(partial.indexOf("inventory") + 1);
  });
  it("moves one entry before another, or to the end", () => {
    const o = menuOrder(null);
    expect(moveMenuItem(o, "settings", "inventory")[0]).toBe("settings");
    expect(moveMenuItem(o, "inventory", null).at(-1)).toBe("inventory");
    expect(moveMenuItem(o, "search", "search")).toBe(o);
    expect(moveMenuItem(o, "inventory", "search").slice(0, 3)).toEqual(["locations", "inventory", "search"]);
  });
});
