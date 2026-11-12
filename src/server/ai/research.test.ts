import { describe, expect, it } from "vitest";
import { labelLinks, partNumberCandidates, researchItem, type Deps, type ResearchInput } from "./research";

// The pipeline with a fake model, fake search and fake pages (DEC-048): what it asks, what it
// keeps, what it throws away.

const input: ResearchInput = {
  name: "Buck converter",
  url: null,
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
    expect(ada.searched).toEqual([]); // the printed link was read, so no search
    expect(r2.sources).toEqual([{ title: "Adafruit 1938", url: "https://www.adafruit.com/product/1938" }]);
    expect(r2.suggestions.map((s) => [s.field, s.value, s.confidence, s.source])).toEqual([
      ["supplier", "Adafruit", "high", "photo"],
      ["supplierPn", "1938", "high", "photo"],
      ["url", "https://www.adafruit.com/product/1938", "high", "photo"],
    ]);
    expect(ada.prompts[1]!.content).toContain("NeoPixel Diffused 5mm Through-Hole LED");
  });

  it("reads the link on record first and skips the search; a known shop's link settles supplier and number; what's on record isn't suggested (DEC-049)", async () => {
    const f = fakes({
      look: { markings: [], description: "A bag of LEDs", likelyPart: "LED", queries: ["5mm RGB LED"] },
      extract: {
        identified: "NeoPixel 5 mm LED, pack of 5",
        suggestions: [
          { field: "price", value: "4.95", source: "https://www.adafruit.com/product/1938", confidence: "high" },
          { field: "supplier", value: "Adafruit Industries", source: "https://www.adafruit.com/product/1938", confidence: "high" }, // settled by the link: ignored
          { field: "name", value: "NeoPixel 5mm LED", source: "https://www.adafruit.com/product/1938", confidence: "high" }, // same as now, case apart: dropped
          { field: "attributes.Voltage", value: "5 V", source: "https://www.adafruit.com/product/1938", confidence: "high" },
        ],
        notes: [],
      },
    });
    f.deps.fetchPage = async (url) => {
      f.fetched.push(url);
      return url === "https://www.adafruit.com/product/1938" ? "NeoPixel Diffused 5mm Through-Hole LED, 5 Pack. $4.95. 5V. " + "x".repeat(300) : null;
    };
    const r = await researchItem({ ...input, name: "neopixel 5mm led", url: "https://www.adafruit.com/product/1938", supplier: "Adafruit" }, f.deps);
    expect(f.fetched).toEqual(["https://www.adafruit.com/product/1938"]);
    expect(f.searched).toEqual([]);
    expect(f.prompts[1]!.content).toContain("--- Page 1: Adafruit 1938 (the owner's page for this exact part)");
    expect(r.sources).toEqual([{ title: "Adafruit 1938", url: "https://www.adafruit.com/product/1938" }]);
    // Supplier and link are on record already; the product number is new and comes from the link.
    expect(r.suggestions.map((s) => [s.field, s.value, s.confidence, s.source])).toEqual([
      ["supplierPn", "1938", "high", "https://www.adafruit.com/product/1938"],
      ["price", "4.95", "high", "https://www.adafruit.com/product/1938"],
      ["attributes.Voltage", "5 V", "high", "https://www.adafruit.com/product/1938"],
    ]);
    expect(r.notes).toEqual([]);
  });

  it("finds the shop page from the supplier and part number on record, and falls back to the search with a note when a link can't be read", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "1.82", source: "https://www.lcsc.com/product-detail/C25804.html", confidence: "high" }], notes: [] },
    });
    f.deps.fetchPage = async (url) => {
      f.fetched.push(url);
      return url === "https://www.lcsc.com/product-detail/C25804.html" ? "0603WAF1002T5E 10kΩ ±1% 0.1W 0603 chip resistor. $1.82 per 100. " + "x".repeat(300) : null;
    };
    const r = await researchItem({ ...input, url: "https://example.com/dead-link", supplier: "LCSC", supplierPn: "C25804" }, f.deps);
    expect(f.fetched).toEqual(["https://example.com/dead-link", "https://www.lcsc.com/product-detail/C25804.html"]);
    expect(f.searched).toEqual([]);
    expect(r.notes).toEqual(["Couldn't read the link on record (example.com)."]);
    expect(r.suggestions.map((s) => [s.field, s.value])).toEqual([["url", "https://www.lcsc.com/product-detail/C25804.html"], ["price", "1.82"]]);
    // Nothing direct readable at all: the search runs as before.
    const g = fakes({ look: { markings: [], description: "", likelyPart: "x", queries: ["LM2596 module"] }, extract: { identified: "x", suggestions: [], notes: [] } });
    const r2 = await researchItem({ ...input, url: "https://example.com/dead-link" }, g.deps);
    expect(g.searched).toEqual(["LM2596 module", "Buck converter"]);
    expect(r2.notes).toEqual(["Couldn't read the link on record (example.com)."]);
  });

  it("reads Mouser and Digi-Key through their API readers, and says so when there's no key", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "4.95", source: "https://www.mouser.com/ProductDetail/485-1938", confidence: "high" }], notes: [] },
    });
    const asked: string[] = [];
    f.deps.shops = { Mouser: async (link) => { asked.push(`${link.productNumber}/${link.makerPn}`); return { title: "Mouser: NeoPixel", url: "https://www.mouser.com/ProductDetail/Adafruit/1938?qs=x", text: "Mouser part number: 485-1938\nPrice (USD): $4.95 each at 1+\n" + "x".repeat(100) }; } };
    const r = await researchItem({ ...input, url: "https://www.mouser.com/ProductDetail/485-1938" }, f.deps);
    expect(asked).toEqual(["485-1938/null"]);
    expect(f.fetched).toEqual([]);
    expect(f.searched).toEqual([]);
    expect(r.sources).toEqual([{ title: "Mouser: NeoPixel", url: "https://www.mouser.com/ProductDetail/485-1938" }]);
    expect(f.prompts[1]!.content).toContain("Mouser part number: 485-1938");
    expect(r.suggestions.map((s) => [s.field, s.value, s.source])).toEqual([
      ["supplier", "Mouser", "https://www.mouser.com/ProductDetail/485-1938"],
      ["supplierPn", "485-1938", "https://www.mouser.com/ProductDetail/485-1938"],
      ["price", "4.95", "https://www.mouser.com/ProductDetail/485-1938"],
    ]);
    // Supplier + part number on record: the Digi-Key reader is asked by that number (the page built for it is a search link).
    const dk = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "99.95", source: "page 1", confidence: "high" }], notes: [] },
    });
    const dkAsked: string[] = [];
    dk.deps.shops = { "Digi-Key": async (link) => { dkAsked.push(`${link.productNumber}/${link.makerPn}`); return { title: "Digi-Key: SMT TEST SOCKET", url: "https://www.digikey.com/en/products/detail/adafruit-industries-llc/1241/6827055", text: "Digi-Key part number: 1528-1938-ND\nPrice (USD): $99.95 each at 1+\n" + "x".repeat(100) }; } };
    const r3 = await researchItem({ ...input, supplier: "Digi-Key", supplierPn: "1528-1938-ND" }, dk.deps);
    expect(dkAsked).toEqual(["1528-1938-ND/null"]);
    expect(dk.searched).toEqual([]);
    expect(r3.suggestions.map((s) => [s.field, s.value])).toContainEqual(["price", "99.95"]);
    // No key: the link is reported, nothing is fetched from mouser.com, the search takes over.
    const g = fakes({ look: { markings: [], description: "", likelyPart: "x", queries: ["q"] }, extract: { identified: "x", suggestions: [], notes: [] } });
    const r2 = await researchItem({ ...input, supplier: "Digi-Key", supplierPn: "1528-1938-ND" }, g.deps);
    expect(g.fetched).toEqual(["https://www.example-supplier.com/lm2596"]);
    expect(r2.notes).toEqual(["Couldn't read the shop page for the part number on record: Digi-Key pages can only be read through its API, and no Digi-Key key is set on this server."]);
  });

  it("without a photo, 'photo' as a source means the page that was read, and with nothing read either the model's notes are dropped", async () => {
    const f = fakes({
      look: { identified: "x", suggestions: [{ field: "name", value: "Pocket screwdriver set", source: "photo", confidence: "medium" }], notes: ["Comes with six bits."] },
      extract: {},
    });
    f.deps.fetchPage = async (url) => (url === "https://www.sparkfun.com/products/12891" ? "Pocket Screwdriver Set TOL-12891 $5.50 " + "x".repeat(300) : null);
    const r = await researchItem({ ...input, supplier: "SparkFun", supplierPn: "12891", photos: [] }, f.deps);
    expect(r.suggestions.map((s) => [s.field, s.value, s.source])).toEqual([["url", "https://www.sparkfun.com/products/12891", "https://www.sparkfun.com/products/12891"], ["name", "Pocket screwdriver set", "https://www.sparkfun.com/products/12891"]]);
    expect(r.notes).toEqual(["Comes with six bits."]);
    const g = fakes({ look: { identified: "x", suggestions: [], notes: ["The part number 136-ProjectBoard-01 is listed on Mouser's website."] }, extract: {} }, []);
    const r2 = await researchItem({ ...input, photos: [] }, g.deps);
    expect(r2.notes).toEqual([]);
    // ...and nothing but a category can be suggested from a name alone.
    const h = fakes({ look: { identified: "x", suggestions: [{ field: "name", value: "Project Board", source: "photo", confidence: "medium" }, { field: "supplier", value: "Mouser", source: "photo", confidence: "medium" }, { field: "category", value: "Electronic components", source: "photo", confidence: "low" }], notes: [] }, extract: {} }, []);
    const r3 = await researchItem({ ...input, name: "Test mouser part", categoryName: null, photos: [] }, h.deps);
    expect(r3.suggestions.map((s) => s.field)).toEqual(["category"]);
  });

  it("takes 'the owner's page', 'Page 2' and a photo-less 'photo' as the page they mean, so a price from the page isn't thrown away", async () => {
    const f = fakes({
      look: { markings: [], description: "A bag of LEDs", likelyPart: "LED", queries: ["5mm LED"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "$4.95", source: "the owner's page for this exact part", confidence: "high" }, { field: "attributes.Voltage", value: "5 V", source: "Page 1", confidence: "high" }, { field: "name", value: "NeoPixel 5mm LED", source: "photo", confidence: "high" }], notes: [] },
    });
    f.deps.fetchPage = async (url) => (url === "https://www.adafruit.com/product/1938" ? "NeoPixel Diffused 5mm Through-Hole LED, 5 Pack. $4.95. 5V. " + "x".repeat(300) : null);
    const r = await researchItem({ ...input, url: "https://www.adafruit.com/product/1938" }, f.deps);
    // With a photo, "photo" means the photo (and an unprinted name is only likely); the rest is the page.
    expect(r.suggestions.map((s) => [s.field, s.value, s.confidence, s.source])).toEqual([
      ["supplier", "Adafruit", "high", "https://www.adafruit.com/product/1938"],
      ["supplierPn", "1938", "high", "https://www.adafruit.com/product/1938"],
      ["price", "4.95", "high", "https://www.adafruit.com/product/1938"],
      ["attributes.Voltage", "5 V", "high", "https://www.adafruit.com/product/1938"],
      ["name", "NeoPixel 5mm LED", "medium", "photo"],
    ]);
  });

  it("a price from a page has to be on that page", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q1"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "0.35", source: "https://www.lcsc.com/product-detail/C25804.html", confidence: "high" }], notes: [] },
    });
    f.deps.fetchPage = async (url) => (url === "https://www.lcsc.com/product-detail/C25804.html" ? "0603WAF1002T5E RES 10kΩ ±1% 100mW 0603. " + "x".repeat(300) : null);
    expect((await researchItem({ ...input, url: "https://www.lcsc.com/product-detail/C25804.html" }, f.deps)).suggestions.map((s) => s.field)).toEqual(["supplier", "supplierPn"]);
    const g = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: ["q1"] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "96", source: "https://www.amazon.com/dp/B07TC2BK1X", confidence: "high" }], notes: [] },
    });
    g.deps.fetchPage = async (url) => (url === "https://www.amazon.com/dp/B07TC2BK1X" ? "Raspberry Pi 4 Model B (4GB) $96.00 $ 96 . 00 In stock. " + "x".repeat(300) : null);
    // On Amazon the price is only ever "likely": the page lists other products' prices first.
    expect((await researchItem({ ...input, url: "https://www.amazon.com/dp/B07TC2BK1X" }, g.deps)).suggestions.map((s) => [s.field, s.value, s.confidence])).toEqual([["supplier", "Amazon", "high"], ["supplierPn", "B07TC2BK1X", "high"], ["price", "96.00", "medium"]]);
  });

  it("drops 'None' and friends: the model saying it has nothing is not a value", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: [] },
      extract: { identified: "x", suggestions: [{ field: "supplier", value: "None", source: "photo", confidence: "low" }, { field: "supplierPn", value: "N/A", source: "photo", confidence: "low" }, { field: "attributes.Interface", value: "unknown", source: "photo", confidence: "low" }], notes: [] },
    }, []);
    expect((await researchItem({ ...input, photos: ["a.jpg"] }, f.deps)).suggestions).toEqual([]);
  });

  it("reads only the first direct page it can: the link on record, and not also the page for the number on record", async () => {
    const f = fakes({
      look: { markings: [], description: "", likelyPart: "x", queries: [] },
      extract: { identified: "x", suggestions: [{ field: "price", value: "4.95", source: "page 1", confidence: "high" }], notes: [] },
    });
    const asked: string[] = [];
    f.deps.shops = { "Digi-Key": async (link) => { asked.push(link.productNumber ?? ""); return { title: "Digi-Key: other", url: "x", text: "Price (USD): $99.95 each\n" + "x".repeat(100) }; } };
    f.deps.fetchPage = async (url) => { f.fetched.push(url); return "NeoPixel Diffused 5mm LED. Price $4.95. " + "x".repeat(300); };
    const r = await researchItem({ ...input, url: "https://www.adafruit.com/product/1938", supplier: "Digi-Key", supplierPn: "1528-1938-ND" }, f.deps);
    expect(f.fetched).toEqual(["https://www.adafruit.com/product/1938"]);
    expect(asked).toEqual([]);
    expect(r.sources.map((s) => s.url)).toEqual(["https://www.adafruit.com/product/1938"]);
  });

  it("keeps the finished suggestions of an answer that was cut off, and says so", async () => {
    // What really happened with a Mouser link: the answer hit the length cap mid-suggestion, the
    // JSON didn't parse, and the screen said "nothing to suggest" with the photo's guess as the part.
    const cut =
      '{ "identified": "Kycon DC power plug", "suggestions": [ { "field": "name", "value": "Kycon KPPX-4P DC power plug", "source": "page 1", "confidence": "high" }, ' +
      '{ "field": "price", "value": "3.66", "source": "page 1", "confidence": "high" }, { "field": "attributes.Voltage", "value": "12 V and then it just keeps go';
    const f = fakes({ look: { markings: ["303"], description: "a silver thing", likelyPart: "Relay", queries: [] }, extract: {} });
    const chat = f.deps.chat;
    let n = 0;
    f.deps.chat = async (req) => (++n === 2 ? (await chat(req), cut) : chat(req));
    f.deps.shops = { Mouser: async () => ({ title: "Mouser: DC Power Connectors", url: "https://www.mouser.com/ProductDetail/Kycon/KPPX-4P?qs=x", text: "Mouser part number: 806-KPPX-4P\nPrice (USD): $3.66 each\n" + "x".repeat(100), productNumber: "806-KPPX-4P" }) };
    const link = "https://www.mouser.com/en/ProductDetail/Kycon/KPPX-4P?qs=abc&countrycode=US";
    const r = await researchItem({ ...input, name: "Relay?", url: link }, f.deps);
    expect(r.identified).toBe("Kycon DC power plug");
    // The link carries the maker's number, so the shop's short name and the number its API gave are settled.
    expect(r.suggestions.map((s) => [s.field, s.value, s.source])).toEqual([
      ["supplier", "Mouser", link],
      ["supplierPn", "806-KPPX-4P", link],
      ["name", "Kycon KPPX-4P DC power plug", link],
      ["price", "3.66", link],
    ]);
    expect(r.notes).toEqual(["The model's answer was cut short; these are the suggestions it finished. Look again for the rest."]);
    // The model is asked to name its sources by page number, and can't write anything longer.
    expect(f.prompts[1]!.content).toContain("--- Page 1: Mouser: DC Power Connectors (the owner's page for this exact part)");
  });

  it("looks a number read off the part up at Mouser and Digi-Key before any web search, exact match only, as 'likely' (DEC-053)", async () => {
    const f = fakes({
      look: { markings: ["KYCON", "KPPX-4P", "2021-6-18", "303"], description: "a silver plug", likelyPart: "DC power plug", queries: ["KPPX-4P"] },
      extract: { identified: "Kycon KPPX-4P plug", suggestions: [{ field: "price", value: "3.66", source: "page 1", confidence: "high" }, { field: "name", value: "Kycon KPPX-4P DC power plug", source: "page 1", confidence: "high" }], notes: [] },
    });
    const asked: string[] = [];
    f.deps.shops = {
      Mouser: async (link) => {
        asked.push(`Mouser:${link.makerPn}`);
        return link.makerPn === "KPPX-4P" ? { title: "Mouser: DC Power Connectors", url: "https://www.mouser.com/ProductDetail/Kycon/KPPX-4P?qs=x", text: "Mouser part number: 806-KPPX-4P\nPrice (USD): $3.66 each\n" + "x".repeat(100), productNumber: "806-KPPX-4P" } : null;
      },
      "Digi-Key": async (link) => {
        asked.push(`Digi-Key:${link.makerPn}`);
        return null;
      },
    };
    const r = await researchItem({ ...input, name: "Plug?" }, f.deps);
    // Only the number-like markings are tried, longest first, Mouser then Digi-Key, stopping at the find.
    expect(asked).toEqual(["Mouser:KPPX-4P"]);
    expect(f.searched).toEqual([]);
    expect(r.sources).toEqual([{ title: "Mouser: DC Power Connectors", url: "https://www.mouser.com/ProductDetail/Kycon/KPPX-4P?qs=x" }]);
    expect(r.suggestions.map((s) => [s.field, s.value, s.confidence])).toEqual([
      ["supplier", "Mouser", "medium"],
      ["supplierPn", "806-KPPX-4P", "medium"],
      ["url", "https://www.mouser.com/ProductDetail/Kycon/KPPX-4P?qs=x", "medium"],
      ["price", "3.66", "high"],
      ["name", "Kycon KPPX-4P DC power plug", "high"],
    ]);
    expect(r.notes).toContain("Found at Mouser by the number read off the part, KPPX-4P. Check it's the right one.");
    // Nothing found at either shop: the web search runs as before.
    const g = fakes({ look: { markings: ["LM2596S"], description: "", likelyPart: "x", queries: ["LM2596 module"] }, extract: { identified: "x", suggestions: [], notes: [] } });
    g.deps.shops = { Mouser: async () => null, "Digi-Key": async () => null };
    await researchItem(input, g.deps);
    expect(g.searched.length).toBeGreaterThan(0);
  });

  it("picks what could be a part number out of the markings", () => {
    expect(partNumberCandidates(["NooPixel Diffused", "5mm LED x5", "http://adafru.it/1938", "P1938", "C2483-003", "2021-6-18", "1528-1938-ND", "KYCON KPPX-4P", "303"])).toEqual([
      "1528-1938-ND",
      "C2483-003",
      "KPPX-4P",
      "P1938",
    ]);
    expect(partNumberCandidates(["LM2596S-ADJ/NOPB", "IN+ IN- OUT+ OUT-"])).toEqual(["LM2596S-ADJ/NOPB"]);
    expect(partNumberCandidates(["just words here"])).toEqual([]);
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
