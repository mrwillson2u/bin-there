import { describe, expect, it } from "vitest";
import { labelLinks, researchItem, type Deps, type ResearchInput } from "./research";

// The pipeline with a fake model, fake search and fake pages (DEC-048): what it asks, what it
// keeps, what it throws away.

const input: ResearchInput = {
  name: "Buck converter",
  categoryName: "Modules & boards",
  fields: [{ key: "Interface", label: "Interface" }, { key: "Voltage", label: "Voltage" }],
  attributes: { Interface: "" },
  supplier: null,
  supplierPn: null,
  notes: null,
  photos: ["a.jpg", "missing.jpg"],
  categories: ["Modules & boards", "Electronic components"],
};

function fakes(answers: { look: object; extract: object }, hits = [{ title: "LM2596 module", url: "https://www.example-supplier.com/lm2596", snippet: "3A step-down" }]) {
  const prompts: { content: string; images?: string[] }[] = [];
  const searched: string[] = [];
  const fetched: string[] = [];
  const deps: Deps = {
    chat: async ({ messages }) => {
      const m = messages[0]!;
      prompts.push({ content: m.content, images: m.images });
      return JSON.stringify(prompts.length === 1 ? answers.look : answers.extract);
    },
    search: async (q) => {
      searched.push(q);
      return hits;
    },
    fetchPage: async (url) => {
      fetched.push(url);
      return url.includes("example-supplier") ? "LM2596 DC-DC buck module. Input 4-40V, output 1.25-37V, 3A. Price $2.49. " + "x".repeat(300) : null;
    },
    readPhoto: async (file) => (file === "a.jpg" ? "QUJD" : null),
  };
  return { deps, prompts, searched, fetched };
}

describe("researchItem", () => {
  it("looks at the photos, searches what the model asked for plus the name, reads supplier pages first, and keeps only supported fields", async () => {
    const f = fakes({
      look: { markings: ["LM2596S", "IN+ IN- OUT+ OUT-"], description: "A small blue DC-DC module", likelyPart: "LM2596 buck converter module", queries: ["LM2596 buck converter module", "LM2596S"] },
      extract: {
        identified: "LM2596 adjustable step-down module",
        suggestions: [
          { field: "attributes.Voltage", value: "4–40 V in, 1.25–37 V out", source: "https://www.example-supplier.com/lm2596", confidence: "high" },
          { field: "price", value: "$2.49 each", source: "https://www.example-supplier.com/lm2596", confidence: "medium" },
          { field: "url", value: "https://www.example-supplier.com/lm2596", source: "https://www.example-supplier.com/lm2596", confidence: "high" },
          { field: "supplierPn", value: "LM2596S", source: "photo", confidence: "high" },
          { field: "name", value: "Buck converter", source: "photo", confidence: "low" }, // same as now: dropped
          { field: "attributes.Weight", value: "10 g", source: "https://www.example-supplier.com/lm2596", confidence: "high" }, // not a field: dropped
          { field: "category", value: "Power", source: "https://nowhere.example/x", confidence: "low" }, // has a category already: dropped
          { field: "url", value: "https://dupe.example", source: "photo", confidence: "low" }, // second url: dropped
        ],
        notes: ["The output voltage is set by the trimmer; measure it."],
      },
    });
    const r = await researchItem(input, f.deps);
    // LOOK got the one readable photo and nothing else: what's known can't be echoed back as a marking.
    expect(f.prompts[0]!.images).toEqual(["QUJD"]);
    expect(f.prompts[0]!.content).not.toContain("Buck converter");
    expect(f.prompts[1]!.content).toContain("Name: Buck converter");
    expect(f.searched).toEqual(["LM2596 buck converter module", "LM2596S", "Buck converter"]);
    expect(f.fetched).toEqual(["https://www.example-supplier.com/lm2596"]);
    // EXTRACT saw the page and the markings.
    expect(f.prompts[1]!.content).toContain("LM2596 DC-DC buck module");
    expect(f.prompts[1]!.content).toContain("Text read off the part: LM2596S | IN+ IN- OUT+ OUT-");
    expect(r.identified).toBe("LM2596 adjustable step-down module");
    expect(r.markings).toEqual(["LM2596S", "IN+ IN- OUT+ OUT-"]);
    expect(r.sources).toEqual([{ title: "LM2596 module", url: "https://www.example-supplier.com/lm2596" }]);
    expect(r.suggestions.map((s) => [s.field, s.value, s.confidence])).toEqual([
      ["attributes.Voltage", "4–40 V in, 1.25–37 V out", "high"],
      ["price", "2.49", "medium"],
      ["url", "https://www.example-supplier.com/lm2596", "high"],
      ["supplierPn", "LM2596S", "high"],
    ]);
    expect(r.suggestions.find((s) => s.field === "price")!.label).toBe("Price");
    expect(r.notes).toEqual(["The output voltage is set by the trimmer; measure it."]);
  });

  it("works with no photo and no pages: no look step, searches the name, suggests a category from the list only", async () => {
    const f = fakes(
      {
        look: { identified: "Nylon cable ties", suggestions: [{ field: "category", value: "Electronic components", source: "photo", confidence: "low" }, { field: "category", value: "Nope", source: "photo", confidence: "low" }], notes: [] },
        extract: {},
      },
      [],
    );
    const r = await researchItem({ ...input, name: "Zip ties", categoryName: null, photos: [] }, f.deps);
    expect(f.prompts).toHaveLength(1);
    expect(f.prompts[0]!.images).toBeUndefined();
    expect(f.prompts[0]!.content).toContain("There is no photo");
    expect(f.searched).toEqual(["Zip ties"]);
    expect(f.prompts[0]!.content).toContain("No pages could be read");
    expect(f.prompts[0]!.content).toContain("`category` must be one of exactly: Modules & boards | Electronic components");
    expect(r.suggestions).toEqual([{ field: "category", label: "Category", value: "Electronic components", source: "photo", confidence: "low" }]);
  });

  it("points a suggestion at a page that was read, even when the model names one that wasn't", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q"] },
      extract: { identified: "x", suggestions: [{ field: "supplier", value: "Example Supplier", source: "https://made-up.example/page", confidence: "medium" }], notes: [] },
    });
    const r = await researchItem(input, f.deps);
    expect(r.suggestions[0]!.source).toBe("https://www.example-supplier.com/lm2596");
  });

  it("off the photo: a part number must be printed, an unprinted brand is only likely, and a printed Adafruit link decides supplier, number and page", async () => {
    // Nothing printed on a bare connector: the model's "JST PH-04" part number is dropped, "JST" stays as likely.
    const bare = fakes({
      look: { markings: [], description: "A small white 2-pin connector", likelyPart: "JST connector", queries: ["JST 2 pin connector"] },
      extract: { identified: "JST PH connector", suggestions: [{ field: "supplierPn", value: "PH-04", source: "photo", confidence: "high" }, { field: "supplier", value: "JST", source: "photo", confidence: "high" }, { field: "name", value: "JST 2-pin pigtail", source: "photo", confidence: "high" }], notes: [] },
    }, []);
    const r1 = await researchItem({ ...input, name: "", supplierPn: null, photos: ["a.jpg"] }, bare.deps);
    expect(r1.suggestions.map((s) => [s.field, s.value, s.confidence])).toEqual([["supplier", "JST", "medium"], ["name", "JST 2-pin pigtail", "medium"]]);
    // An Adafruit bag: the printed link is fetched first and settles supplier, product number (not the lot code) and the page.
    const ada = fakes({
      look: { markings: ["NeoPixel Diffused", "5mm LED x5", "http://adafru.it/1938", "C2483-003"], description: "A bag of LEDs", likelyPart: "NeoPixel 5mm LED", queries: ["NeoPixel 5mm LED"] },
      extract: { identified: "NeoPixel 5 mm LED, pack of 5", suggestions: [{ field: "supplierPn", value: "C2483-003", source: "photo", confidence: "high" }, { field: "supplier", value: "Adafruit", source: "photo", confidence: "high" }, { field: "url", value: "https://adafruit.com/x", source: "photo", confidence: "high" }], notes: [] },
    }, []);
    ada.deps.fetchPage = async (url) => (url === "https://www.adafruit.com/product/1938" ? "NeoPixel Diffused 5mm Through-Hole LED, 5 Pack. $4.95. " + "x".repeat(300) : null);
    const r2 = await researchItem({ ...input, name: "", supplierPn: null, photos: ["a.jpg"] }, ada.deps);
    expect(r2.sources).toEqual([{ title: "https://www.adafruit.com/product/1938", url: "https://www.adafruit.com/product/1938" }]);
    expect(r2.suggestions.map((s) => [s.field, s.value, s.confidence, s.source])).toEqual([
      ["supplier", "Adafruit", "high", "photo"],
      ["supplierPn", "1938", "high", "photo"],
      ["url", "https://www.adafruit.com/product/1938", "high", "photo"],
    ]);
    expect(ada.prompts[1]!.content).toContain("NeoPixel Diffused 5mm Through-Hole LED");
  });

  it("reads product links off labels", () => {
    expect(labelLinks(["RasPi stacking headers", "http://adafru.it/1112", "adafru.it/1112"])).toEqual([{ supplier: "Adafruit", productNumber: "1112", url: "https://www.adafruit.com/product/1112" }]);
    expect(labelLinks(["https://www.sparkfun.com/products/13678"])).toEqual([{ supplier: "SparkFun", productNumber: "13678", url: "https://www.sparkfun.com/products/13678" }]);
    expect(labelLinks(["LM2596S"])).toEqual([]);
  });

  it("survives a model that doesn't answer in JSON and a search that fails", async () => {
    const deps: Deps = {
      chat: async () => "Sorry, I can't help with that.",
      search: async () => { throw new Error("SearXNG down"); },
      fetchPage: async () => null,
      readPhoto: async () => null,
    };
    const r = await researchItem(input, deps);
    expect(r.suggestions).toEqual([]);
    expect(r.identified).toBe("Buck converter");
    expect(r.queries).toEqual(["Buck converter"]);
    expect(r.notes[0]).toContain("The web search didn't answer this time (SearXNG down)");
  });
});
