// Digi-Key's Product Information API, version 4 (DEC-049): free, an app registered at
// developer.digikey.com gives a client id and secret, a thousand lookups a day. Digi-Key's pages
// sit behind a bot check, so a Digi-Key link (which carries the maker's part number) or a
// Digi-Key part number on record is looked up here and laid out as text for the model.

import { pageText, type ShopPage, type ShopReader } from "./shops";

type DkProduct = {
  Description?: { ProductDescription?: string; DetailedDescription?: string };
  Manufacturer?: { Name?: string };
  ManufacturerProductNumber?: string;
  UnitPrice?: number;
  ProductUrl?: string;
  DatasheetUrl?: string;
  QuantityAvailable?: number;
  Category?: { Name?: string };
  ProductVariations?: { DigiKeyProductNumber?: string; PackageType?: { Name?: string }; StandardPricing?: { BreakQuantity?: number; UnitPrice?: number }[] }[];
  Parameters?: { ParameterText?: string; ValueText?: string }[];
};

const API = "https://api.digikey.com";

export function digikeyReader(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): ShopReader {
  let token: { value: string; until: number } | null = null;
  const getToken = async () => {
    if (token && token.until > Date.now()) return token.value;
    const res = await fetchImpl(`${API}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Digi-Key refused the key (${res.status})`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Digi-Key sent no token");
    token = { value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 600) - 60) * 1000 };
    return token.value;
  };
  const headers = async () => ({
    Authorization: `Bearer ${await getToken()}`,
    "X-DIGIKEY-Client-Id": clientId,
    "X-DIGIKEY-Locale-Site": "US",
    "X-DIGIKEY-Locale-Language": "en",
    "X-DIGIKEY-Locale-Currency": "USD",
    Accept: "application/json",
  });
  return async (link) => {
    const lookFor = link.productNumber ?? link.makerPn;
    if (!lookFor) return null;
    try {
      let product: DkProduct | undefined;
      if (link.productNumber) {
        const res = await fetchImpl(`${API}/products/v4/search/${encodeURIComponent(lookFor)}/productdetails`, { headers: await headers(), signal: AbortSignal.timeout(20_000) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Digi-Key answered ${res.status}`);
        product = ((await res.json()) as { Product?: DkProduct }).Product;
      } else {
        // A maker's number such as "1938" matches thousands of Digi-Key parts; the answer's ExactMatches
        // are the ones whose maker number is exactly that, and the link's maker slug picks among them.
        // No exact match for that maker means no page at all: a wrong part is worse than none.
        const res = await fetchImpl(`${API}/products/v4/search/keyword`, {
          method: "POST",
          headers: { ...(await headers()), "Content-Type": "application/json" },
          body: JSON.stringify({ Keywords: lookFor, Limit: 10, Offset: 0 }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`Digi-Key answered ${res.status}`);
        const data = (await res.json()) as { ExactMatches?: DkProduct[]; Products?: DkProduct[] };
        const maker = makerSlug(link.url);
        const candidates = [...(data.ExactMatches ?? []), ...(data.Products ?? [])].filter((p) => (p.ManufacturerProductNumber ?? "").toLowerCase() === lookFor.toLowerCase());
        product = (maker ? candidates.find((p) => slug(p.Manufacturer?.Name ?? "") === maker) : undefined) ?? (maker ? undefined : candidates[0]);
      }
      return product ? digikeyPage(product, link.url) : null;
    } catch (e) {
      throw new Error(`Digi-Key lookup failed: ${(e as Error).message}`);
    }
  };
}

/** The maker's slug in a Digi-Key detail link: /products/detail/adafruit-industries-llc/1938/6827082 → "adafruit-industries-llc". */
function makerSlug(url: string): string | null {
  const m = url.match(/\/products\/detail\/([^/]+)\/[^/]+\/\d+/);
  return m ? m[1]!.toLowerCase() : null;
}

/** Digi-Key's slug for a maker's name: "Adafruit Industries LLC" → "adafruit-industries-llc". */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function digikeyPage(p: DkProduct, fallbackUrl: string): ShopPage {
  // The cut-tape or single-unit variation is the one a garage buys; the first listed is usually it.
  const v = p.ProductVariations?.[0];
  const prices = (v?.StandardPricing ?? [])
    .slice(0, 4)
    .filter((b) => typeof b.UnitPrice === "number")
    .map((b) => `$${b.UnitPrice!.toFixed(2)} each at ${b.BreakQuantity ?? 1}+`)
    .join(", ");
  const params = (p.Parameters ?? []).filter((x) => x.ParameterText && x.ValueText).map((x) => `${x.ParameterText}: ${x.ValueText}`);
  const url = p.ProductUrl || fallbackUrl;
  const text = pageText([
    ["Shop", "Digi-Key Electronics"],
    ["Digi-Key part number", v?.DigiKeyProductNumber],
    ["Manufacturer", p.Manufacturer?.Name],
    ["Manufacturer part number", p.ManufacturerProductNumber],
    ["Description", p.Description?.ProductDescription],
    ["Details", p.Description?.DetailedDescription],
    ["Category", p.Category?.Name],
    ["Packaging", v?.PackageType?.Name],
    ["Price (USD)", prices || (typeof p.UnitPrice === "number" ? `$${p.UnitPrice.toFixed(2)} each` : null)],
    ["In stock", p.QuantityAvailable],
    ["Datasheet", p.DatasheetUrl],
    ["Product page", url],
    ["Specifications", params.length ? "\n" + params.join("\n") : null],
  ]);
  return { title: `Digi-Key: ${p.Description?.ProductDescription ?? p.ManufacturerProductNumber ?? "part"}`, url, text };
}
