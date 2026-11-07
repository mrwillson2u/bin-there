// Mouser's Search API (DEC-049): free, a key from mouser.com/api-hub, a thousand lookups a day.
// Mouser's pages refuse automated readers, so a Mouser link or a Mouser part number on record is
// looked up here and the answer is laid out as text for the model to read.

import { pageText, type ShopPage, type ShopReader } from "./shops";

type MouserPart = {
  MouserPartNumber?: string;
  ManufacturerPartNumber?: string;
  Manufacturer?: string;
  Description?: string;
  Category?: string;
  DataSheetUrl?: string;
  ProductDetailUrl?: string;
  Availability?: string;
  PriceBreaks?: { Quantity?: number; Price?: string; Currency?: string }[];
  ProductAttributes?: { AttributeName?: string; AttributeValue?: string }[];
};
type MouserAnswer = { Errors?: { Message?: string }[]; SearchResults?: { Parts?: MouserPart[] } | null };

export function mouserReader(apiKey: string, fetchImpl: typeof fetch = fetch): ShopReader {
  return async (link) => {
    const byNumber = !!link.productNumber;
    const lookFor = link.productNumber ?? link.makerPn;
    if (!lookFor) return null;
    const endpoint = byNumber ? "partnumber" : "keyword";
    const body = byNumber
      ? { SearchByPartRequest: { mouserPartNumber: lookFor, partSearchOptions: "" } }
      : { SearchByKeywordRequest: { keyword: lookFor, records: 3, startingRecord: 0 } };
    try {
      const res = await fetchImpl(`https://api.mouser.com/api/v1/search/${endpoint}?apiKey=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Mouser answered ${res.status}`);
      const data = (await res.json()) as MouserAnswer;
      if (data.Errors?.length) throw new Error(`Mouser said: ${data.Errors.map((e) => e.Message).join(", ")}`);
      const parts = data.SearchResults?.Parts ?? [];
      // A keyword search can match several; the one whose maker number is exactly what was asked for wins.
      const part = parts.find((p) => (p.ManufacturerPartNumber ?? "").toLowerCase() === lookFor.toLowerCase()) ?? parts[0];
      if (!part) return null;
      return mouserPage(part, link.url);
    } catch (e) {
      throw new Error(`Mouser lookup failed: ${(e as Error).message}`);
    }
  };
}

export function mouserPage(part: MouserPart, fallbackUrl: string): ShopPage {
  const prices = (part.PriceBreaks ?? [])
    .filter((b) => b.Price)
    .slice(0, 4)
    .map((b) => `${b.Price} each at ${b.Quantity ?? 1}+`)
    .join(", ");
  const attrs = (part.ProductAttributes ?? []).filter((a) => a.AttributeName && a.AttributeValue).map((a) => `${a.AttributeName}: ${a.AttributeValue}`);
  const url = part.ProductDetailUrl || fallbackUrl;
  const text = pageText([
    ["Shop", "Mouser Electronics"],
    ["Mouser part number", part.MouserPartNumber],
    ["Manufacturer", part.Manufacturer],
    ["Manufacturer part number", part.ManufacturerPartNumber],
    ["Description", part.Description],
    ["Category", part.Category],
    ["Price (USD)", prices],
    ["Availability", part.Availability],
    ["Datasheet", part.DataSheetUrl],
    ["Product page", url],
    ["Specifications", attrs.length ? "\n" + attrs.join("\n") : null],
  ]);
  return { title: `Mouser: ${part.Description ?? part.MouserPartNumber ?? "part"}`, url, text };
}
