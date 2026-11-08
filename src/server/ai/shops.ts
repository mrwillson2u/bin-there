// The shops Colin buys from (DEC-049): Mouser, Digi-Key, Amazon, Adafruit, SparkFun and LCSC.
// A link to one of them says which shop and which product; a supplier and part number on record
// can be turned into the page to read without a search engine. Adafruit, SparkFun, LCSC and
// Amazon serve their product pages to a plain fetch. Digi-Key and Mouser refuse automated
// readers and offer free APIs instead (`digikey.ts`, `mouser.ts`), so their links are read
// through the API when a key is set and reported as unreadable when it isn't.

export type Shop = "Adafruit" | "SparkFun" | "LCSC" | "Amazon" | "Digi-Key" | "Mouser";

export type ShopLink = {
  shop: Shop;
  /** The shop's own product number when the link or record carries one: Adafruit 1938, LCSC C25804, an Amazon ASIN, a Mouser or Digi-Key part number. */
  productNumber: string | null;
  /** The manufacturer's part number when the link carries that instead (Digi-Key and Mouser detail links). */
  makerPn: string | null;
  url: string;
};

/** Shops whose product pages a plain fetch can read. The other two go through their API. */
export const PLAIN_SHOPS: ReadonlySet<Shop> = new Set<Shop>(["Adafruit", "SparkFun", "LCSC", "Amazon"]);

/** Which shop and product a link points at, or null for a link to anywhere else. */
export function shopFromUrl(raw: string): ShopLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  // Segments are matched raw and decoded after, so an encoded slash in a maker part number (LM2596S-ADJ%2FNOPB) stays one segment.
  const path = u.pathname;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if (host === "adafru.it" || host.endsWith("adafruit.com")) {
    const m = path.match(/^\/(?:products?\/)?(\d{2,6})(?:\/|$)/);
    return m ? { shop: "Adafruit", productNumber: m[1]!, makerPn: null, url: `https://www.adafruit.com/product/${m[1]}` } : null;
  }
  if (host.endsWith("sparkfun.com")) {
    const m = path.match(/\/products\/(\d{3,6})(?:\/|$)/) ?? path.match(/-(\d{3,6})\.html$/);
    return m ? { shop: "SparkFun", productNumber: m[1]!, makerPn: null, url: `https://www.sparkfun.com/products/${m[1]}` } : null;
  }
  if (host.endsWith("lcsc.com")) {
    const m = path.match(/\/product-detail\/(?:.*[_/])?(C\d{2,9})\.html$/i);
    return m ? { shop: "LCSC", productNumber: m[1]!.toUpperCase(), makerPn: null, url: `https://www.lcsc.com/product-detail/${m[1]!.toUpperCase()}.html` } : null;
  }
  if (/(^|\.)amazon\.[a-z.]+$/.test(host) || host === "amzn.com" || host === "a.co") {
    const m = path.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i);
    if (!m) return null;
    const asin = m[1]!.toUpperCase();
    return { shop: "Amazon", productNumber: asin, makerPn: null, url: `https://www.${host.includes("amazon.") ? host : "amazon.com"}/dp/${asin}` };
  }
  if (host.endsWith("digikey.com") || host.endsWith("digikey.ca")) {
    // /en/products/detail/<maker>/<maker part number>/<id>, or a search link /products/result?keywords=<part number>
    const m = path.match(/\/products\/detail\/[^/]+\/([^/]+)\/\d+/);
    const kw = (u.searchParams.get("keywords") ?? "").trim();
    return { shop: "Digi-Key", productNumber: !m && kw ? kw : null, makerPn: m ? dec(m[1]!) : null, url: u.toString() };
  }
  if (host.endsWith("mouser.com") || host.endsWith("mouser.ca")) {
    // /ProductDetail/<maker>/<maker part number>?qs=… or /ProductDetail/<Mouser part number>
    const m = path.match(/\/ProductDetail\/([^/]+)(?:\/([^/]+))?/i);
    if (!m) return { shop: "Mouser", productNumber: null, makerPn: null, url: u.toString() };
    return m[2] ? { shop: "Mouser", productNumber: null, makerPn: dec(m[2]), url: u.toString() } : { shop: "Mouser", productNumber: dec(m[1]!), makerPn: null, url: u.toString() };
  }
  return null;
}

/** The shop a supplier name means, if it's one of the six. */
export function shopNamed(supplier: string | null | undefined): Shop | null {
  const s = (supplier ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.includes("digikey")) return "Digi-Key";
  if (s.includes("mouser")) return "Mouser";
  if (s.includes("amazon")) return "Amazon";
  if (s.includes("adafruit")) return "Adafruit";
  if (s.includes("sparkfun")) return "SparkFun";
  if (s.includes("lcsc")) return "LCSC";
  return null;
}

/** The page for a supplier and part number on record, when the shop's addresses are known. */
export function shopPage(supplier: string | null | undefined, pn: string | null | undefined): ShopLink | null {
  const shop = shopNamed(supplier);
  const n = (pn ?? "").trim();
  if (!shop || !n) return null;
  switch (shop) {
    case "Adafruit":
      return /^\d{2,6}$/.test(n) ? { shop, productNumber: n, makerPn: null, url: `https://www.adafruit.com/product/${n}` } : null;
    case "SparkFun":
      return /^\d{3,6}$/.test(n) ? { shop, productNumber: n, makerPn: null, url: `https://www.sparkfun.com/products/${n}` } : null;
    case "LCSC":
      return /^C\d{2,9}$/i.test(n) ? { shop, productNumber: n.toUpperCase(), makerPn: null, url: `https://www.lcsc.com/product-detail/${n.toUpperCase()}.html` } : null;
    case "Amazon":
      return /^[A-Z0-9]{10}$/i.test(n) ? { shop, productNumber: n.toUpperCase(), makerPn: null, url: `https://www.amazon.com/dp/${n.toUpperCase()}` } : null;
    case "Digi-Key":
      return { shop, productNumber: n, makerPn: null, url: `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(n)}` };
    case "Mouser":
      return { shop, productNumber: n, makerPn: null, url: `https://www.mouser.com/ProductDetail/${encodeURIComponent(n)}` };
  }
}

/** A shop's answer about one product, as text the model reads like a page. */
export type ShopPage = { title: string; url: string; text: string };
export type ShopReader = (link: ShopLink) => Promise<ShopPage | null>;

/** Lines of "Label: value" into page-like text, skipping empties. */
export function pageText(lines: [string, string | number | null | undefined][]): string {
  return lines
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}
