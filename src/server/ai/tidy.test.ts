import { describe, expect, it } from "vitest";
import { grounded, tidyNames, type TidyPart } from "./tidy";
import type { Chat } from "./ollama";

describe("tidying a category's names (DEC-076)", () => {
  const parts: TidyPart[] = [
    { id: 1, name: "3.7V 2000mAh lipo LP103450", fields: { Voltage: "3.7 V", Capacity: "2000 mAh" } },
    { id: 2, name: "LiPo battery 3.7 V 1200 mAh", fields: {} },
    { id: 3, name: "Rechargeable Lipo", fields: { Capacity: "500 mAh" } },
    { id: 4, name: "AA cells", fields: {} },
  ];
  it("suggests only names that change, and drops any that add a number the part's record doesn't hold", async () => {
    let asked = "";
    const chat: Chat = async ({ messages }) => {
      asked = messages.map((m) => m.content).join("\n");
      return JSON.stringify({
        names: [
          { id: 1, name: "LiPo battery 3.7 V 2000 mAh LP103450" },
          { id: 2, name: "LiPo battery 3.7 V 1200 mAh" }, // unchanged
          { id: 3, name: "LiPo battery 3.7 V 500 mAh" }, // 3.7 V is invented
          { id: 4, name: "  AA  battery " },
          { id: 9, name: "Nobody" },
        ],
      });
    };
    const out = await tidyNames(chat, "Batteries", parts);
    expect(out).toEqual([
      { id: 1, name: "3.7V 2000mAh lipo LP103450", suggestion: "LiPo battery 3.7 V 2000 mAh LP103450" },
      { id: 4, name: "AA cells", suggestion: "AA battery" },
    ]);
    expect(asked).toContain("Category: Batteries");
    expect(asked).toContain('1. "3.7V 2000mAh lipo LP103450" (Voltage: 3.7 V; Capacity: 2000 mAh)');
    expect(asked).toContain("the kind of thing first");
  });
  it("a value from the part's fields may go into its name", () => {
    expect(grounded(parts[2]!, "LiPo battery 500 mAh")).toBe(true);
    expect(grounded(parts[2]!, "LiPo battery 600 mAh")).toBe(false);
    expect(grounded(parts[0]!, "LiPo battery 3.7V 2000 mAh")).toBe(true);
  });
  it("an answer that isn't JSON is an error, not a rename", async () => {
    await expect(tidyNames(async () => "sorry", "Batteries", parts)).rejects.toThrow("couldn't be read");
  });
});
