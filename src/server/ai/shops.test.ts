import { describe, expect, it } from "vitest";
import { shopFromUrl, shopNamed, shopPage } from "./shops";
import { mouserPage, mouserReader } from "./mouser";
import { digikeyPage, digikeyReader } from "./digikey";

// The six shops (DEC-049): what a link says, the page for a part number on record, and the two
// API readers against fake answers.

describe("shopFromUrl", () => {
  it("knows the six shops' product links and nothing else", () => {
    expect(shopFromUrl("https://www.adafruit.com/product/1938")).toEqual({ shop: "Adafruit", productNumber: "1938", makerPn: null, url: "https://www.adafruit.com/product/1938" });
    expect(shopFromUrl("http://adafru.it/1112")).toMatchObject({ shop: "Adafruit", productNumber: "1112" });
    expect(shopFromUrl("https://www.adafruit.com/products/1112?x=1")).toMatchObject({ shop: "Adafruit", productNumber: "1112" });
    expect(shopFromUrl("https://www.sparkfun.com/products/12891")).toMatchObject({ shop: "SparkFun", productNumber: "12891" });
    expect(shopFromUrl("https://www.sparkfun.com/pocket-screwdriver-set-12891.html")).toMatchObject({ shop: "SparkFun", productNumber: "12891" });
    expect(shopFromUrl("https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF1002T5E_C25804.html")).toEqual({ shop: "LCSC", productNumber: "C25804", makerPn: null, url: "https://www.lcsc.com/product-detail/C25804.html" });
    expect(shopFromUrl("https://lcsc.com/product-detail/c25804.html")).toMatchObject({ productNumber: "C25804" });
    expect(shopFromUrl("https://www.amazon.com/Raspberry-Pi-Model-2019-Quad/dp/B07TC2BK1X/ref=sr_1_3?keywords=pi")).toEqual({ shop: "Amazon", productNumber: "B07TC2BK1X", makerPn: null, url: "https://www.amazon.com/dp/B07TC2BK1X" });
    expect(shopFromUrl("https://www.amazon.ca/gp/product/b07tc2bk1x")).toMatchObject({ shop: "Amazon", productNumber: "B07TC2BK1X", url: "https://www.amazon.ca/dp/B07TC2BK1X" });
    expect(shopFromUrl("https://www.digikey.com/en/products/detail/adafruit-industries-llc/1938/5154662")).toEqual({ shop: "Digi-Key", productNumber: null, makerPn: "1938", url: "https://www.digikey.com/en/products/detail/adafruit-industries-llc/1938/5154662" });
    expect(shopFromUrl("https://www.digikey.com/en/products/detail/texas-instruments/LM2596S-ADJ%2FNOPB/366911")).toMatchObject({ shop: "Digi-Key", makerPn: "LM2596S-ADJ/NOPB" });
    expect(shopFromUrl("https://www.digikey.com/en/products/result?keywords=1528-1938-ND")).toMatchObject({ shop: "Digi-Key", productNumber: "1528-1938-ND", makerPn: null });
    expect(shopFromUrl("https://www.mouser.com/ProductDetail/Adafruit/1938?qs=abc")).toMatchObject({ shop: "Mouser", productNumber: null, makerPn: "1938" });
    expect(shopFromUrl("https://www.mouser.com/ProductDetail/485-1938")).toMatchObject({ shop: "Mouser", productNumber: "485-1938", makerPn: null });
    expect(shopFromUrl("https://www.adafruit.com/category/168")).toBeNull();
    expect(shopFromUrl("https://www.pololu.com/product/2990")).toBeNull();
    expect(shopFromUrl("not a link")).toBeNull();
  });
});

describe("shopPage", () => {
  it("builds the page for a supplier and part number on record, when the shop's addresses are known", () => {
    expect(shopNamed("Digi-Key")).toBe("Digi-Key");
    expect(shopNamed("digikey")).toBe("Digi-Key");
    expect(shopNamed("Amazon.com")).toBe("Amazon");
    expect(shopNamed("Pololu")).toBeNull();
    expect(shopPage("Adafruit", "1938")).toMatchObject({ shop: "Adafruit", url: "https://www.adafruit.com/product/1938" });
    expect(shopPage("Adafruit", "C2483-003")).toBeNull(); // a lot code, not a product number
    expect(shopPage("SparkFun", "12891")).toMatchObject({ url: "https://www.sparkfun.com/products/12891" });
    expect(shopPage("LCSC", "c25804")).toMatchObject({ productNumber: "C25804", url: "https://www.lcsc.com/product-detail/C25804.html" });
    expect(shopPage("Amazon", "B07TC2BK1X")).toMatchObject({ url: "https://www.amazon.com/dp/B07TC2BK1X" });
    expect(shopPage("Amazon", "Raspberry Pi 4")).toBeNull();
    expect(shopPage("Digi-Key", "1528-1938-ND")).toMatchObject({ shop: "Digi-Key", productNumber: "1528-1938-ND" });
    expect(shopPage("Mouser", "485-1938")).toMatchObject({ shop: "Mouser", productNumber: "485-1938", url: "https://www.mouser.com/ProductDetail/485-1938" });
    expect(shopPage("Mouser", "")).toBeNull();
    expect(shopPage(null, "123")).toBeNull();
  });
});

describe("mouserReader", () => {
  const part = {
    MouserPartNumber: "485-1938",
    ManufacturerPartNumber: "1938",
    Manufacturer: "Adafruit",
    Description: "Diffused 5mm NeoPixel LED, 5 pack",
    Category: "LEDs",
    DataSheetUrl: "https://www.mouser.com/datasheet/1938.pdf",
    ProductDetailUrl: "https://www.mouser.com/ProductDetail/Adafruit/1938?qs=xyz",
    Availability: "120 In Stock",
    PriceBreaks: [{ Quantity: 1, Price: "$4.95", Currency: "USD" }, { Quantity: 10, Price: "$4.46", Currency: "USD" }],
    ProductAttributes: [{ AttributeName: "Illumination Color", AttributeValue: "RGB" }, { AttributeName: "Lens Style", AttributeValue: "Diffused" }],
  };
  it("asks by Mouser part number or by the maker's number, and lays the answer out as a page", async () => {
    const asked: { url: string; body: unknown }[] = [];
    const read = mouserReader("KEY", (async (u: URL | string | Request, init?: RequestInit) => {
      asked.push({ url: String(u), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ Errors: [], SearchResults: { NumberOfResult: 1, Parts: [part] } }));
    }) as typeof fetch);
    const page = await read({ shop: "Mouser", productNumber: "485-1938", makerPn: null, url: "https://www.mouser.com/ProductDetail/485-1938" });
    expect(asked[0]).toEqual({ url: "https://api.mouser.com/api/v1/search/partnumber?apiKey=KEY", body: { SearchByPartRequest: { mouserPartNumber: "485-1938", partSearchOptions: "" } } });
    expect(page!.title).toBe("Mouser: Diffused 5mm NeoPixel LED, 5 pack");
    expect(page!.url).toBe("https://www.mouser.com/ProductDetail/Adafruit/1938?qs=xyz");
    expect(page!.text).toContain("Mouser part number: 485-1938");
    expect(page!.text).toContain("Price (USD): $4.95 each\n");
    expect(page!.text).toContain("Illumination Color: RGB");
    await read({ shop: "Mouser", productNumber: null, makerPn: "1938", url: "https://www.mouser.com/ProductDetail/Adafruit/1938" });
    expect(asked[1]!.url).toBe("https://api.mouser.com/api/v1/search/keyword?apiKey=KEY");
    expect(asked[1]!.body).toEqual({ SearchByKeywordRequest: { keyword: "1938", records: 3, startingRecord: 0 } });
  });
  it("says why when Mouser refuses, and gives null when nothing matches", async () => {
    const refused = mouserReader("BAD", (async () => new Response(JSON.stringify({ Errors: [{ Message: "Invalid unique identifier." }], SearchResults: null }))) as typeof fetch);
    await expect(refused({ shop: "Mouser", productNumber: "485-1938", makerPn: null, url: "x" })).rejects.toThrow("Mouser lookup failed: Mouser said: Invalid unique identifier.");
    const empty = mouserReader("KEY", (async () => new Response(JSON.stringify({ Errors: [], SearchResults: { Parts: [] } }))) as typeof fetch);
    expect(await empty({ shop: "Mouser", productNumber: "nope", makerPn: null, url: "x" })).toBeNull();
    expect(mouserPage({}, "https://www.mouser.com/x").text).toBe("Shop: Mouser Electronics\nProduct page: https://www.mouser.com/x");
  });
});

describe("digikeyReader", () => {
  const product = {
    Description: { ProductDescription: "LED RGB DIFFUSED 5MM T-1 3/4 5PK", DetailedDescription: "NeoPixel Diffused 5mm Through-Hole LED, 5 Pack" },
    Manufacturer: { Name: "Adafruit Industries LLC" },
    ManufacturerProductNumber: "1938",
    UnitPrice: 4.95,
    ProductUrl: "https://www.digikey.com/en/products/detail/adafruit-industries-llc/1938/5154662",
    DatasheetUrl: "https://cdn-shop.adafruit.com/datasheets/WS2812.pdf",
    QuantityAvailable: 311,
    Category: { Name: "Optoelectronics" },
    ProductVariations: [{ DigiKeyProductNumber: "1528-1938-ND", PackageType: { Name: "Bulk" }, StandardPricing: [{ BreakQuantity: 1, UnitPrice: 4.95 }, { BreakQuantity: 10, UnitPrice: 4.46 }] }],
    Parameters: [{ ParameterText: "Color", ValueText: "RGB" }, { ParameterText: "Lens Style", ValueText: "Diffused" }],
  };
  it("gets a token once, then asks by Digi-Key number or by keyword, and lays the answer out as a page", async () => {
    const asked: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const read = digikeyReader("ID", "SECRET", (async (u: URL | string | Request, init?: RequestInit) => {
      const url = String(u);
      asked.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? String(init.body) : undefined });
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "TOK", expires_in: 599 }));
      if (url.includes("/productdetails")) return new Response(JSON.stringify({ Product: product }));
      // What Digi-Key really answers for "1938": thousands of loose matches, two exact ones from different makers.
      return new Response(JSON.stringify({
        ExactMatches: [{ ...product, Manufacturer: { Name: "Keystone Electronics" }, ProductVariations: [{ DigiKeyProductNumber: "36-1938-ND" }] }, product],
        Products: [{ ...product, Manufacturer: { Name: "Molex" }, ManufacturerProductNumber: "5011938000" }],
      }));
    }) as typeof fetch);
    const page = await read({ shop: "Digi-Key", productNumber: "1528-1938-ND", makerPn: null, url: "https://www.digikey.com/en/products/result?keywords=1528-1938-ND" });
    expect(asked[0]!.body).toBe("client_id=ID&client_secret=SECRET&grant_type=client_credentials");
    expect(asked[1]!.url).toBe("https://api.digikey.com/products/v4/search/1528-1938-ND/productdetails");
    expect(asked[1]!.headers).toMatchObject({ Authorization: "Bearer TOK", "X-DIGIKEY-Client-Id": "ID", "X-DIGIKEY-Locale-Currency": "USD" });
    expect(page!.title).toBe("Digi-Key: LED RGB DIFFUSED 5MM T-1 3/4 5PK");
    expect(page!.url).toBe("https://www.digikey.com/en/products/detail/adafruit-industries-llc/1938/5154662");
    expect(page!.text).toContain("Digi-Key part number: 1528-1938-ND");
    expect(page!.text).toContain("Price (USD): $4.95 each\n");
    expect(page!.text).toContain("Color: RGB");
    // A detail link carries the maker's number: a keyword search, the exact match wins, the token is reused.
    const byMaker = await read({ shop: "Digi-Key", productNumber: null, makerPn: "1938", url: "https://www.digikey.com/en/products/detail/adafruit-industries-llc/1938/5154662" });
    expect(asked).toHaveLength(3);
    expect(asked[2]!.url).toBe("https://api.digikey.com/products/v4/search/keyword");
    expect(JSON.parse(asked[2]!.body!)).toEqual({ Keywords: "1938", Limit: 10, Offset: 0 });
    expect(byMaker!.text).toContain("Manufacturer: Adafruit Industries LLC\n");
    expect(byMaker!.text).toContain("Digi-Key part number: 1528-1938-ND\n");
    // The link's maker has no exact match: no page, rather than someone else's part.
    const wrongMaker = await read({ shop: "Digi-Key", productNumber: null, makerPn: "1938", url: "https://www.digikey.com/en/products/detail/molex/1938/1" });
    expect(wrongMaker).toBeNull();
  });
  it("says why when the key is refused", async () => {
    const read = digikeyReader("ID", "BAD", (async () => new Response("no", { status: 401 })) as typeof fetch);
    await expect(read({ shop: "Digi-Key", productNumber: "x", makerPn: null, url: "x" })).rejects.toThrow("Digi-Key lookup failed: Digi-Key refused the key (401)");
    expect(digikeyPage({}, "https://www.digikey.com/x").text).toBe("Shop: Digi-Key Electronics\nProduct page: https://www.digikey.com/x");
  });
});
