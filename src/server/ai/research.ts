// AI data fill (DEC-048): work out what a part is from everything already known about it, the
// name, the category, any fields, the notes and its photos, look it up on the web, and suggest
// details. It never writes: the screen shows the suggestions and Colin accepts them one by one,
// and whatever is accepted is marked as filled in by AI with where it came from.
//
// Three steps, each one model call: LOOK (read the photos and markings, decide what to search
// for), SEARCH (SearXNG, then fetch a few pages), EXTRACT (fill the fields from the pages).
// The pieces (chat, search, fetch, photo bytes) are passed in so the pipeline can be tested
// without a model or the internet.

import type { ResearchResult, Suggestion } from "../../shared/api";
import type { Chat, ChatMessage } from "./ollama";
import type { FetchPage, Hit, Search } from "./search";

export type Deps = {
  chat: Chat;
  search: Search;
  fetchPage: FetchPage;
  /** The photo as base64 JPEG, or null if it can't be read. */
  readPhoto: (file: string) => Promise<string | null>;
  log?: (line: string) => void;
};

export type ResearchInput = {
  name: string;
  categoryName: string | null;
  /** The category's fields, label by key, so the model fills the ones that exist. */
  fields: { key: string; label: string }[];
  attributes: Record<string, string>;
  supplier: string | null;
  supplierPn: string | null;
  notes: string | null;
  /** Photo files, main first. */
  photos: string[];
  /** Every category, so one can be suggested for a part without one. */
  categories: string[];
};

const LOOK_SCHEMA = {
  type: "object",
  properties: {
    markings: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    likelyPart: { type: "string" },
    queries: { type: "array", items: { type: "string" } },
  },
  required: ["markings", "description", "likelyPart", "queries"],
};

type Look = { markings: string[]; description: string; likelyPart: string; queries: string[] };

/** Suppliers and makers first: their pages have the fields. Forums and videos last. */
const GOOD_HOSTS = /digikey|mouser|lcsc|ti\.com|st\.com|microchip|nxp|analog\.com|adafruit|sparkfun|pololu|seeedstudio|dfrobot|raspberrypi|arduino|espressif|amazon|aliexpress|mcmaster|boltdepot|datasheet|alldatasheet|octopart|farnell|newark|rs-online|element14/i;
const BAD_HOSTS = /youtube|facebook|reddit|pinterest|tiktok|instagram|twitter|x\.com|quora/i;

export async function researchItem(input: ResearchInput, deps: Deps): Promise<ResearchResult> {
  const log = deps.log ?? (() => {});
  const known = describeKnown(input);

  // LOOK: photos (up to 3) and what's known, to decide what this is and what to search for.
  const images: string[] = [];
  for (const file of input.photos.slice(0, 3)) {
    const b64 = await deps.readPhoto(file);
    if (b64) images.push(b64);
  }
  const lookPrompt = [
    "You identify parts and components in a garage or electronics workshop inventory.",
    images.length > 0
      ? "Look at the photo(s) of one part. Read every piece of printed text exactly as written (chip markings, labels, silkscreen, model numbers, values), listing each as one string in `markings`. Don't guess at characters you can't read; leave them out."
      : "There is no photo. Work from what is known.",
    "Say what the part most likely is in `likelyPart` (a specific product or part number if you can tell, otherwise a type), describe it in one sentence in `description`,",
    "and give 2 or 3 web search queries in `queries` that would find its supplier or datasheet page: the most specific one first (a part number if there is one), then a broader one.",
    "Known so far:",
    known,
  ].join("\n");
  const lookRaw = await deps.chat({
    messages: [{ role: "user", content: lookPrompt, ...(images.length ? { images } : {}) }],
    schema: LOOK_SCHEMA,
  });
  const look = parseJson<Look>(lookRaw, { markings: [], description: "", likelyPart: input.name, queries: [] });
  look.queries = uniq([...(look.queries ?? []), ...(input.supplierPn ? [input.supplierPn] : []), input.name].filter((q) => q && q.trim().length > 1)).slice(0, 3);
  log(`look: ${look.likelyPart} | markings ${look.markings.length} | queries ${look.queries.join(" / ")}`);

  // SEARCH: a few queries (stopping once there's enough to read, so the engines aren't hammered),
  // then up to 4 pages, suppliers and makers first.
  const hits: Hit[] = [];
  const problems: string[] = [];
  for (const q of look.queries) {
    if (hits.length >= 6) break;
    try {
      for (const h of await deps.search(q)) if (!hits.some((x) => x.url === h.url)) hits.push(h);
    } catch (e) {
      log(`search failed for "${q}": ${(e as Error).message}`);
      problems.push((e as Error).message);
    }
  }
  const ranked = hits
    .filter((h) => !BAD_HOSTS.test(h.url))
    .sort((a, b) => Number(GOOD_HOSTS.test(b.url)) - Number(GOOD_HOSTS.test(a.url)));
  const pages: { title: string; url: string; text: string }[] = [];
  for (const h of ranked) {
    if (pages.length >= 4) break;
    const text = await deps.fetchPage(h.url);
    if (text && text.length > 200) pages.push({ title: h.title, url: h.url, text });
  }
  log(`search: ${hits.length} hits, ${pages.length} pages read`);

  // EXTRACT: fill the fields from the pages (and the markings), each with its source.
  const fieldList = [
    { key: "name", label: "Name" },
    ...(input.categoryName ? [] : [{ key: "category", label: "Category" }]),
    ...input.fields.map((f) => ({ key: `attributes.${f.key}`, label: f.label })),
    { key: "supplier", label: "Supplier" },
    { key: "supplierPn", label: "Supplier part #" },
    { key: "price", label: "Price (USD, number only)" },
    { key: "url", label: "Link (the best page for this part)" },
  ];
  const extractSchema = {
    type: "object",
    properties: {
      identified: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: fieldList.map((f) => f.key) },
            value: { type: "string" },
            source: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["field", "value", "source", "confidence"],
        },
      },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["identified", "suggestions", "notes"],
  };
  const extractPrompt = [
    "You fill in the details of one part in a garage inventory, from pages found on the web and from text read off the part itself.",
    "Suggest a value only for a field you can actually support with the pages or the markings; leave a field out rather than guess. Never invent part numbers, prices or links.",
    "For each suggestion, `source` is the URL of the page it came from, or the word photo if it was read off the part. `confidence` is high when a page states it outright for this exact part, medium when it is likely but the match isn't certain, low when it is inferred.",
    "`price` is a number in USD with no symbol, and only ever from a page, never from the photo or memory. `url` is the one best page for this part (supplier or maker): a page that was read, or a web address printed on the part. `name` is a short clear name as the owner would say it, only if the current name is missing, vague or wrong.",
    "`supplierPn` is the number to order it by: for Adafruit or SparkFun that is the product number in the adafru.it or sparkfun.com link, not a lot or date code.",
    ...(input.categoryName ? [] : [`\`category\` must be one of exactly: ${input.categories.join(" | ")}`]),
    "Put anything the owner should know in `notes` (an unreadable value, two likely matches, a field that needs a meter reading), in plain words, one short sentence each, no greeting and no name.",
    "",
    "Fields to fill (use these keys exactly): " + fieldList.map((f) => `${f.key} = ${f.label}`).join("; "),
    "",
    "Known so far:",
    known,
    `What the photos showed: ${look.description || "no photo"}. Likely part: ${look.likelyPart}. Markings: ${look.markings.join(" | ") || "none"}.`,
    "",
    ...pages.flatMap((p, i) => [`--- Page ${i + 1}: ${p.title}`, `URL: ${p.url}`, p.text, ""]),
    pages.length === 0 ? "No pages could be read. Suggest only what the markings and what's known support, and say so in notes." : "",
  ].join("\n");
  const extractRaw = await deps.chat({ messages: [{ role: "user", content: extractPrompt }], schema: extractSchema });
  const extracted = parseJson<{ identified: string; suggestions: Suggestion[]; notes: string[] }>(extractRaw, { identified: look.likelyPart, suggestions: [], notes: [] });

  const labels = new Map(fieldList.map((f) => [f.key, f.label.replace(/ \(.*\)$/, "")]));
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const s of extracted.suggestions ?? []) {
    if (!labels.has(s.field) || seen.has(s.field)) continue;
    const value = clean(s.field, String(s.value ?? ""));
    if (!value) continue;
    if (s.field === "category" && !input.categories.includes(value)) continue;
    // A price can only come from a page that was read. A link from the photo must be printed on the part.
    const fromPage = pages.some((p) => p.url === s.source);
    if (s.field === "price" && !fromPage) continue;
    if (s.field === "url" && !fromPage && !look.markings.some((m) => m.includes(value.replace(/^https?:\/\//, "").replace(/\/$/, "")))) continue;
    if (s.field === "name" && value.toLowerCase() === input.name.trim().toLowerCase()) continue;
    if (s.field.startsWith("attributes.") && (input.attributes[s.field.slice(11)] ?? "").trim() === value) continue;
    // A page that wasn't read can't be a source; fall back to the first page, or the photo.
    const source = pages.some((p) => p.url === s.source) ? s.source : s.source === "photo" ? "photo" : (pages[0]?.url ?? "photo");
    seen.add(s.field);
    suggestions.push({ field: s.field, label: labels.get(s.field)!, value, source, confidence: s.confidence ?? "low" });
  }
  log(`extract: ${suggestions.length} suggestions`);

  const notes = (extracted.notes ?? []).filter((n) => typeof n === "string" && n.trim()).slice(0, 5);
  if (problems.length > 0 && pages.length === 0) notes.unshift(`The web search didn't answer this time (${uniq(problems)[0]}). Try again in a while; only what's on the part itself is suggested.`);
  return {
    identified: extracted.identified || look.likelyPart,
    markings: look.markings ?? [],
    queries: look.queries,
    sources: pages.map((p) => ({ title: p.title, url: p.url })),
    suggestions,
    notes,
  };
}

function describeKnown(input: ResearchInput): string {
  const lines = [
    `Name: ${input.name || "(none yet)"}`,
    `Category: ${input.categoryName ?? "(none yet)"}`,
    ...Object.entries(input.attributes).filter(([, v]) => v).map(([k, v]) => `${input.fields.find((f) => f.key === k)?.label ?? k}: ${v}`),
    ...(input.supplier ? [`Supplier: ${input.supplier}`] : []),
    ...(input.supplierPn ? [`Supplier part #: ${input.supplierPn}`] : []),
    ...(input.notes ? [`Notes: ${input.notes}`] : []),
  ];
  return lines.join("\n");
}

function clean(field: string, value: string): string {
  let v = value.trim();
  if (field === "price") {
    const m = v.replace(/,/g, "").match(/\d+(\.\d+)?/);
    if (!m) return "";
    const n = Number(m[0]);
    return n > 0 && n < 1_000_000 ? n.toFixed(2) : "";
  }
  if (field === "url") return /^https?:\/\/\S+$/.test(v) ? v : "";
  if (v.length > 200) v = v.slice(0, 200);
  return v;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) return fallback;
    return { ...fallback, ...(JSON.parse(raw.slice(start, end + 1)) as T) };
  } catch {
    return fallback;
  }
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()))];

export type { ChatMessage, ResearchResult, Suggestion };
