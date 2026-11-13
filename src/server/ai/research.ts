// AI data fill (DEC-048): work out what a part is from everything already known about it, the
// name, the category, any fields, the notes and its photos, look it up on the web, and suggest
// details. It never writes: the screen shows the suggestions and Colin accepts them one by one,
// and whatever is accepted is marked as filled in by AI with where it came from.
//
// Three steps: LOOK (the photos alone go to the model: read the markings, say what it looks
// like, propose searches; what's already on record is kept out of this call so the model can't
// echo a known part number back as something it "read"), READ (the link on record, the shop
// page for the supplier and part number on record, and any address printed on the part, in that
// order; only when none of those can be read does the web search run and a few hits get
// fetched; DEC-049), EXTRACT (fill the fields from the pages, the markings and what's known).
// The pieces (chat, search, fetch, shop APIs, photo bytes) are passed in so the pipeline can be
// tested without a model or the internet.

import type { ResearchResult, Suggestion } from "../../shared/api";
import type { Chat, ChatMessage } from "./ollama";
import type { FetchPage, Hit, ReadPdf, Search } from "./search";
import { PLAIN_SHOPS, shopFromUrl, shopPage, type Shop, type ShopLink, type ShopReader } from "./shops";

export type Deps = {
  chat: Chat;
  search: Search;
  fetchPage: FetchPage;
  /** Readers for the shops whose pages can't be fetched (Mouser, Digi-Key): present only when a key is set. */
  shops?: Partial<Record<Shop, ShopReader>>;
  /** The photo as base64 JPEG, or null if it can't be read. */
  readPhoto: (file: string) => Promise<string | null>;
  /** A datasheet's first pages as text (DEC-053); absent means datasheets aren't read. */
  readPdf?: ReadPdf;
  log?: (line: string) => void;
};

export type ResearchInput = {
  name: string;
  /** The link on record: the page for this exact part, read first. */
  url: string | null;
  categoryName: string | null;
  /** The category's fields, label by key, so the model fills the ones that exist. */
  /** A field with `options` is a choice field (DEC-059): the model picks one of them or leaves it. */
  fields: { key: string; label: string; options?: string[] }[];
  attributes: Record<string, string>;
  supplier: string | null;
  supplierPn: string | null;
  notes: string | null;
  /** Photo files, main first. */
  photos: string[];
  /** Every category, so one can be suggested for a part without one. */
  categories: string[];
  /**
   * Every category's fields (per-unit ones left out, DEC-062), by category name: a part with no
   * category gets the fields of the one the photo puts it in, filled in the same run (DEC-064).
   */
  fieldsByCategory?: Record<string, { key: string; label: string; options?: string[] }[]>;
  /** The names of parts already in each category, most recently changed first: the owner's way of naming (DEC-065). */
  namesByCategory?: Record<string, string[]>;
};

/** The photo step's answer; `category` is one of the inventory's own when the part has none yet. */
const lookSchema = (categories: string[] | null) => ({
  type: "object",
  properties: {
    markings: { type: "array", items: { type: "string" } },
    partNumbers: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    likelyPart: { type: "string" },
    name: { type: "string" },
    ...(categories ? { category: { type: "string", enum: categories } } : {}),
    queries: { type: "array", items: { type: "string" } },
  },
  required: ["markings", "partNumbers", "description", "likelyPart", "name", ...(categories ? ["category"] : []), "queries"],
});

type Look = { markings: string[]; partNumbers?: string[]; description: string; likelyPart: string; name?: string; category?: string; queries: string[] };

export type ResearchOptions = {
  /** Quick naming (DEC-053): the photo alone, no reading or searching; a likely name and category. */
  quick?: boolean;
};

/** Suppliers and makers first: their pages have the fields. Forums and videos last. */
const GOOD_HOSTS = /digikey|mouser|lcsc|ti\.com|st\.com|microchip|nxp|analog\.com|adafruit|sparkfun|pololu|seeedstudio|dfrobot|raspberrypi|arduino|espressif|amazon|aliexpress|mcmaster|boltdepot|datasheet|alldatasheet|octopart|farnell|newark|rs-online|element14/i;
const BAD_HOSTS = /youtube|facebook|reddit|pinterest|tiktok|instagram|twitter|x\.com|quora/i;

export async function researchItem(input: ResearchInput, deps: Deps, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const log = deps.log ?? (() => {});
  const known = describeKnown(input);
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // LOOK: the photos (up to 3) on their own. Nothing known goes in, so every marking that comes
  // back was read off the picture (or made up, which the search will show up). No photo, no look.
  const images: string[] = [];
  for (const file of input.photos.slice(0, 3)) {
    const b64 = await deps.readPhoto(file);
    if (b64) images.push(b64);
  }
  let look: Look = { markings: [], description: "", likelyPart: input.name, queries: [] };
  const wantCategory = !input.categoryName && input.categories.length > 0;
  if (images.length > 0) {
    const lookPrompt = [
      "You identify parts and components in a garage or electronics workshop inventory. These are photo(s) of one part, and you know nothing else about it.",
      "`markings`: every piece of text actually printed on the part, its label or its bag, exactly as written, one string each (model numbers, values, web addresses, brand names you can see). Only text you can see. If nothing is printed, leave it empty. Never list a brand, a type or a part number you merely recognise or expect: that is not a marking.",
      "`partNumbers`: the markings that are a model or part number, the maker's or seller's number to order it by, written without spaces inside it (\"PL 103750\" is PL103750). Not a rating, size, count, date, batch or lot code, standard (ISO 9001) or brand name. Empty if there is none.",
      "`description`: one sentence saying what you see (what kind of part, how many pins or leads, colour, size clues).",
      "`likelyPart`: what it most likely is: a specific product if a marking names one, otherwise just the kind of part.",
      `\`name\`: a short, clear name for it. ${NAMING} Only as specific as what you can actually see: a brand, series, model or part number goes in only when it's printed and in \`markings\`; otherwise name the kind of thing with what's printed or plainly visible (ratings, pins, colour, size). A plain right name beats a specific wrong one.`,
      ...nonEmpty(namesGuide(input.namesByCategory, input.categoryName)),
      ...(wantCategory ? [`\`category\`: the one of these it belongs in: ${input.categories.join(" | ")}`] : []),
      "`queries`: 2 or 3 web searches that would find its supplier or datasheet page, built from the markings and what you see: the most specific first. Don't put a part number in a query unless it's in the markings.",
    ].join("\n");
    const lookRaw = await deps.chat({ messages: [{ role: "user", content: lookPrompt, images }], schema: lookSchema(wantCategory ? input.categories : null) });
    look = parseJson<Look>(lookRaw, look);
    look.markings = (look.markings ?? []).filter((m) => typeof m === "string" && m.trim()).map((m) => m.trim());
    // A part number the model saw counts only if it is printed: spaces out, and found in the markings.
    look.partNumbers = (look.partNumbers ?? [])
      .filter((n) => typeof n === "string")
      .map((n) => n.replace(/\s+/g, ""))
      .filter((n) => n.length >= 4 && n.length <= 32 && /\d/.test(n) && look.markings.some((m) => squash(m).includes(squash(n))));
  }
  // The category the photo put a part with none in (DEC-064): its fields are filled in this same run.
  const pickedCategory = wantCategory && images.length > 0 && input.categories.includes(String(look.category ?? "")) ? String(look.category) : null;
  const fields = input.categoryName ? input.fields : pickedCategory ? (input.fieldsByCategory?.[pickedCategory] ?? []) : [];
  // What's on record searches too: a known part number first, the name last.
  look.queries = uniq([...(input.supplierPn ? [input.supplierPn] : []), ...(look.queries ?? []), input.name].filter((q) => q && q.trim().length > 1)).slice(0, 3);
  log(`look (${elapsed()}): ${look.likelyPart} | markings ${look.markings.length} | queries ${look.queries.join(" / ")}`);

  // QUICK (DEC-053): the photo alone. A likely name, and a category when the part has none;
  // nothing read, nothing searched, one model call. For the things with nothing to look up.
  if (opts.quick) {
    const quick: Suggestion[] = [];
    const name = withoutUnprintedNumbers(clean("name", String(look.name ?? "")), look.markings);
    if (images.length > 0 && name && name.trim().toLowerCase() !== input.name.trim().toLowerCase()) quick.push({ field: "name", label: "Name", value: name, source: "photo", confidence: "medium" });
    const category = String(look.category ?? "");
    if (images.length > 0 && wantCategory && input.categories.includes(category)) quick.push({ field: "category", label: "Category", value: category, source: "photo", confidence: "high" });
    log(`quick (${elapsed()}): ${quick.length} suggestions`);
    return { identified: look.likelyPart || input.name, markings: look.markings, queries: look.queries, sources: [], suggestions: quick, notes: images.length === 0 ? ["No photo to go by."] : [] };
  }

  // READ: the pages that name this exact part, no search engine needed. The link on record
  // first (the owner's own), then the shop page for the supplier and part number on record, then
  // a web address printed on the part (Adafruit and SparkFun bags carry one; its product number
  // is the number in that address, whatever else the label says). A link to one of the known
  // shops also settles the supplier and its product number.
  const labelled = labelLinks(look.markings);
  const direct: { title: string; url: string; link: ShopLink | null; why: string; sure?: boolean }[] = [];
  const addDirect = (url: string | null, why: string, known?: ShopLink | null) => {
    const u = (url ?? "").trim();
    if (!/^https?:\/\/\S+$/.test(u) || direct.some((d) => d.url === u)) return;
    const link = known ?? shopFromUrl(u);
    direct.push({ title: link ? `${link.shop}${link.productNumber ? ` ${link.productNumber}` : ""}` : u, url: u, link, why });
  };
  addDirect(input.url, "the link on record");
  const onRecord = shopPage(input.supplier, input.supplierPn);
  addDirect(onRecord?.url ?? null, "the shop page for the part number on record", onRecord);
  for (const l of labelled) addDirect(l.url, "printed on the part");

  const pages: { title: string; url: string; text: string; own: boolean; productNumber?: string | null; productUrl?: string | null; datasheetUrl?: string | null; datasheet?: boolean }[] = [];
  const problems: string[] = [];
  const notes: string[] = [];
  // Only the first page that can be read: the link on record outranks the number on record, which
  // outranks a printed label, and two pages for one part were once two different products.
  for (const d of direct) {
    if (pages.length > 0) break;
    try {
      const page = await readDirect(d.url, d.link, deps);
      if (page) pages.push({ ...page, own: true });
      else notes.push(`Couldn't read ${d.why} (${hostOf(d.url)}).`);
    } catch (e) {
      notes.push(`Couldn't read ${d.why}: ${(e as Error).message}`);
      log(`read failed for ${d.url}: ${(e as Error).message}`);
    }
  }
  log(`read (${elapsed()}): ${direct.length} direct links, ${pages.length} read`);

  // SHOPS (DEC-053): nothing read yet, but something that looks like a part number was printed on
  // the part. Mouser's and Digi-Key's own search, through their APIs, is far surer than a web
  // search: only an exact match on the maker's (or the shop's) number counts, and the first found
  // is the page. Longest number first, since a short one matches more loosely.
  if (pages.length === 0 && deps.shops) {
    // A number on record (typed on the form, DEC-061) goes first, then the printed ones.
    // Then the numbers the model saw printed (DEC-064), then the ones the pattern picks out.
    const numbers = uniqBy([...(input.supplierPn ? [input.supplierPn] : []), ...(look.partNumbers ?? []), ...partNumberCandidates(look.markings)], squash).slice(0, 5);
    const readers = (["Mouser", "Digi-Key"] as Shop[]).filter((s) => deps.shops![s]);
    let tried = 0;
    outer: for (const number of numbers) {
      for (const shop of readers) {
        tried++;
        try {
          const page = await deps.shops[shop]!({ shop, productNumber: null, makerPn: number, url: "" });
          if (page && page.text.length > 40) {
            const url = page.url;
            direct.push({ title: page.title, url, link: { shop, productNumber: page.productNumber ?? null, makerPn: number, url }, why: "the number read off the part", sure: false });
            pages.push({ title: page.title, url, text: page.text, own: false, productNumber: page.productNumber ?? null, productUrl: url, datasheetUrl: page.datasheetUrl ?? null });
            notes.push(number === input.supplierPn ? `Found at ${shop} by the part number on record, ${number}.` : `Found at ${shop} by the number read off the part, ${number}. Check it's the right one.`);
            log(`shops (${elapsed()}): ${number} found at ${shop} after ${tried} lookups`);
            break outer;
          }
        } catch (e) {
          log(`shops: ${shop} failed for ${number}: ${(e as Error).message}`);
        }
      }
    }
    if (pages.length === 0 && numbers.length > 0) log(`shops (${elapsed()}): nothing for ${numbers.join(", ")} after ${tried} lookups`);
  }

  // DATASHEET (DEC-053): a shop page names one, and the category has fields to fill (voltage,
  // package…) that the shop page often lacks. Its first pages are read as one more page.
  const sheet = pages.find((p) => p.datasheetUrl);
  if (sheet?.datasheetUrl && fields.length > 0 && deps.readPdf) {
    const text = await deps.readPdf(sheet.datasheetUrl).catch(() => null);
    if (text) {
      pages.push({ title: "Datasheet (first pages)", url: sheet.datasheetUrl, text, own: false, datasheet: true });
      log(`datasheet (${elapsed()}): read ${text.length} chars from ${hostOf(sheet.datasheetUrl)}`);
    } else log(`datasheet (${elapsed()}): couldn't read ${sheet.datasheetUrl}`);
  }

  // SEARCH, only when nothing direct could be read: a few queries (stopping once there's enough
  // to read, so the engines aren't hammered), then up to 4 pages, suppliers and makers first.
  const hits: Hit[] = [];
  if (pages.length === 0) {
    for (const q of look.queries) {
      if (hits.length >= 6) break;
      try {
        const found = await deps.search(q);
        // An engine that takes the app for a bot can answer with junk (DEC-066): a hit sharing no word with its query goes.
        const kept = found.filter((h) => onTopic(h, q));
        if (kept.length < found.length) log(`search: dropped ${found.length - kept.length} off-topic hits for "${q}"`);
        for (const h of kept) if (!hits.some((x) => x.url === h.url)) hits.push(h);
      } catch (e) {
        log(`search failed for "${q}": ${(e as Error).message}`);
        problems.push((e as Error).message);
      }
    }
    const ranked = hits.filter((h) => !BAD_HOSTS.test(h.url)).sort((a, b) => Number(GOOD_HOSTS.test(b.url)) - Number(GOOD_HOSTS.test(a.url)));
    for (const h of ranked) {
      if (pages.length >= 4) break;
      const link = shopFromUrl(h.url);
      const page = await readDirect(h.url, link, deps).catch(() => null);
      if (page) pages.push({ ...page, title: h.title, own: false });
    }
    log(`search (${elapsed()}): ${hits.length} hits, ${pages.length} pages read`);
  }

  // EXTRACT: fill the fields from the pages (and the markings), each with its source.
  const fieldList: { key: string; label: string; options?: string[] }[] = [
    { key: "name", label: "Name" },
    ...(input.categoryName || pickedCategory ? [] : [{ key: "category", label: "Category" }]),
    ...fields.map((f) => ({ key: `attributes.${f.key}`, label: f.label, options: f.options })),
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
            // Short names, not addresses: a long shop address written out for every suggestion was
            // most of the answer, and one answer hit the length cap that way and was lost.
            source: { type: "string", enum: ["photo", ...pages.map((_, i) => `page ${i + 1}`)] },
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
    "For each suggestion, `source` is the page it came from, written as its number below (page 1, page 2), or the word photo if it was read off the part. `confidence` is high when a page states it outright for this exact part, medium when it is likely but the match isn't certain, low when it is inferred.",
    "A page marked 'the owner's page for this exact part' is the shop page the owner saved or ordered from: what it says about the part is certain (high), and its price and specifications are this part's.",
    "A page marked 'the part's datasheet' is the maker's own document for it: its ratings and specifications fill the fields (high); it has no price.",
    "An Amazon page lists other products first (sponsored, 'consider these alternative items', 'customers also bought'); this part's own price is the one by its own title, and if that isn't shown, suggest no price.",
    "`price` is a number in USD with no symbol, and only ever from a page, never from the photo or memory; when a page shows this part's price, suggest it (the single-unit price, not a quantity discount). `url` is the address (the URL line) of the one best page for this part (supplier or maker): a page that was read, or a web address printed on the part. `name` is a short clear name, only if the current name is missing, vague or wrong; what it is and its values come from a page's description when a page names the part, not from what the photo looked like. With no page, only as specific as the markings: no brand, series, model or number that isn't printed on the part. A plain right name beats a specific wrong one.",
    `Naming: ${NAMING}`,
    ...nonEmpty(namesGuide(input.namesByCategory, input.categoryName ?? pickedCategory)),
    "`supplierPn` is the number to order it by: for Adafruit or SparkFun that is the product number in the adafru.it or sparkfun.com link, not a lot or date code.",
    ...(input.categoryName || pickedCategory ? [] : [`\`category\` must be one of exactly: ${input.categories.join(" | ")}`]),
    "Put anything the owner should know in `notes` (an unreadable value, two likely matches, a field that needs a meter reading), in plain words, one short sentence each, no greeting and no name.",
    "",
    "Fields to fill (use these keys exactly): " + fieldList.map((f) => `${f.key} = ${f.label}${f.options?.length ? ` (exactly one of: ${f.options.join(" | ")}; leave it out if none fits)` : ""}`).join("; "),
    "",
    "Known so far:",
    known,
    ...(pickedCategory ? [`Category, from the photos: ${pickedCategory}. Fill its fields from the markings and pages.`] : []),
    images.length > 0
      ? `What the photos showed: ${look.description}. Likely part from the photos alone: ${look.likelyPart}. Text read off the part: ${look.markings.join(" | ") || "none printed"}.`
      : "There is no photo.",
    "",
    ...pages.flatMap((p, i) => [`--- Page ${i + 1}: ${p.title}${p.own ? " (the owner's page for this exact part)" : p.datasheet ? " (the part's datasheet)" : ""}`, `URL: ${p.url}`, p.text, ""]),
    pages.length === 0 ? "No pages could be read. Suggest only what the markings and what's known support, and say so in notes." : "",
  ].join("\n");
  const extractRaw = await deps.chat({ messages: [{ role: "user", content: extractPrompt }], schema: extractSchema });
  log(`extract answer: ${extractRaw.replace(/\s+/g, " ").slice(0, 600)}`);
  const extracted = parseExtract(extractRaw, look.likelyPart);
  if (extracted.cutOff) {
    log(`extract answer was cut off: kept ${extracted.suggestions.length} finished suggestions`);
    notes.push("The model's answer was cut short; these are the suggestions it finished. Look again for the rest.");
  }

  const labels = new Map(fieldList.map((f) => [f.key, f.label.replace(/ \(.*\)$/, "")]));
  const choices = new Map(fieldList.filter((f) => f.options?.length).map((f) => [f.key, f.options!]));
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  // The category the photo picked (DEC-064) leads: the field suggestions below are its fields.
  if (pickedCategory) {
    seen.add("category");
    suggestions.push({ field: "category", label: "Category", value: pickedCategory, source: "photo", confidence: "high" });
  }
  const printed = (value: string) => look.markings.some((m) => squash(m).includes(squash(value)) && squash(value).length >= 3);
  // What's on record already isn't a suggestion.
  const current: Record<string, string> = {
    name: input.name,
    supplier: input.supplier ?? "",
    supplierPn: input.supplierPn ?? "",
    url: input.url ?? "",
    ...Object.fromEntries(Object.entries(input.attributes).map(([k, v]) => [`attributes.${k}`, v])),
  };
  const sameAsNow = (field: string, value: string) => (current[field] ?? "").trim().toLowerCase() === value.trim().toLowerCase();
  // A known shop's page that was read decides supplier, product number and link; the model
  // doesn't get a say. A printed address counts as read off the photo.
  // The supplier is the shop's short name ("Mouser", not the page's "Mouser Electronics"); the
  // number is the one in the link, else the one the shop's API gave; the link is the one followed,
  // or the shop's own address for the part when the page was found from a part number.
  const settled = direct.find((d) => d.link && pages.some((p) => p.url === d.url));
  if (settled?.link) {
    const page = pages.find((p) => p.url === settled.url)!;
    const number = settled.link.productNumber ?? page.productNumber ?? null;
    for (const s of [
      { field: "supplier", value: settled.link.shop },
      ...(number ? [{ field: "supplierPn", value: number }] : []),
      { field: "url", value: settled.why === "the shop page for the part number on record" && page.productUrl ? page.productUrl : settled.url },
    ]) {
      if (!labels.has(s.field)) continue;
      seen.add(s.field);
      if (sameAsNow(s.field, s.value)) continue;
      suggestions.push({ field: s.field, label: labels.get(s.field)!, value: s.value, source: settled.why === "printed on the part" ? "photo" : settled.url, confidence: settled.sure === false ? "medium" : "high" });
    }
  }
  for (const s of extracted.suggestions ?? []) {
    if (!labels.has(s.field) || seen.has(s.field)) continue;
    let value = clean(s.field, String(s.value ?? ""));
    // A choice field takes one of its options, in the option's own spelling, or nothing (DEC-059).
    const options = choices.get(s.field);
    if (options) value = options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? "";
    if (!value || sameAsNow(s.field, value)) continue;
    if (s.field === "category" && !input.categories.includes(value)) continue;
    // No photo and no page: the only thing with anything behind it is a category guessed from the name.
    if (images.length === 0 && pages.length === 0 && s.field !== "category") continue;
    const page = pageFor(String(s.source ?? ""), pages, images.length > 0);
    const fromPage = !!page;
    const fromPhoto = !fromPage;
    // Off the photo, a value has to be printed on the part to be sure: a price never is, a link or
    // a part number must be in the markings, and anything else unprinted is at best likely.
    if (s.field === "price" && (fromPhoto || !priceOnPage(value, page!.text))) continue;
    if ((s.field === "url" || s.field === "supplierPn") && fromPhoto && !printed(value)) continue;
    // A name from the photo alone carries no number that isn't printed there.
    const value2 = s.field === "name" && fromPhoto ? withoutUnprintedNumbers(value, look.markings) : value;
    if (!value2) continue;
    let confidence: Suggestion["confidence"] = s.confidence ?? "low";
    // Amazon's page shows neighbouring products' prices first, and the model can take one of those.
    if (s.field === "price" && page && /\bamazon\./i.test(page.url) && confidence === "high") confidence = "medium";
    if (fromPhoto && !printed(value) && confidence === "high") confidence = s.field === "category" ? "high" : "medium";
    const source = page ? page.url : "photo";
    seen.add(s.field);
    suggestions.push({ field: s.field, label: labels.get(s.field)!, value: value2, source, confidence });
  }
  log(`extract (${elapsed()}): ${suggestions.length} suggestions`);

  if (pages.length > 0 || images.length > 0) notes.push(...(extracted.notes ?? []).filter((n) => typeof n === "string" && n.trim()).slice(0, 5));
  if (problems.length > 0 && pages.length === 0) notes.unshift(`The web search didn't answer this time (${uniq(problems)[0]}). Try again in a while; only what's on the part itself is suggested.`);
  return {
    identified: extracted.identified || look.likelyPart,
    markings: look.markings ?? [],
    queries: look.queries,
    sources: pages.map((p) => ({ title: p.title, url: p.url })),
    suggestions,
    notes: uniq(notes),
  };
}

/**
 * One page as the model will read it: a shop that refuses fetches goes through its API reader
 * (and throws a plain-words reason when there's no key), anything else is fetched. The page
 * keeps the address it was asked by, so the record's link stays the link.
 */
async function readDirect(url: string, link: ShopLink | null, deps: Deps): Promise<{ title: string; url: string; text: string; productNumber?: string | null; productUrl?: string | null; datasheetUrl?: string | null } | null> {
  if (link && !PLAIN_SHOPS.has(link.shop)) {
    const reader = deps.shops?.[link.shop];
    if (!reader) throw new Error(`${link.shop} pages can only be read through its API, and no ${link.shop} key is set on this server.`);
    const page = await reader(link);
    return page && page.text.length > 40 ? { title: page.title, url, text: page.text, productNumber: page.productNumber ?? null, productUrl: page.url, datasheetUrl: page.datasheetUrl ?? null } : null;
  }
  const text = await deps.fetchPage(url);
  if (!text || text.length <= 200) return null;
  const title = link ? `${link.shop}${link.productNumber ? ` ${link.productNumber}` : ""}` : hostOf(url);
  return { title, url, text };
}

/**
 * Which page a suggestion's `source` means. The model is asked for the page's address but often
 * writes "the owner's page for this exact part", "Page 2" or, with no photo at all, "photo"; a
 * page that wasn't read can't be a source either. So: the exact address, else "Page N", else the
 * first page unless it really means the photo (only possible when there is one), else nothing.
 */
function pageFor<P extends { url: string }>(source: string, pages: P[], hasPhoto: boolean): P | null {
  const exact = pages.find((p) => p.url === source);
  if (exact) return exact;
  const n = source.match(/\bpage\s*(\d+)/i);
  if (n) return pages[Number(n[1]) - 1] ?? pages[0] ?? null;
  if (/^photo$/i.test(source.trim()) && hasPhoto) return null;
  return pages[0] ?? null;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** A price "from a page" has to be on it: "4.95" matches "$4.95", "4,95" and Amazon's "$ 4 . 95". */
function priceOnPage(value: string, text: string): boolean {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  const digits = text.replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2");
  const forms = [n.toFixed(2), String(n), n.toFixed(1), n.toFixed(3), n.toFixed(4)];
  return forms.some((f) => new RegExp(`(^|[^\\d.])${f.replace(".", "\\.")}(?![\\d])`).test(digits));
}

/** Letters and digits only, lower case: "adafru.it/1938" and "ADAFRU IT 1938" match. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Product links printed on a bag: Adafruit's adafru.it/NNNN and SparkFun's sparkfun.com/products/NNNNN. */
export function labelLinks(markings: string[]): { supplier: string; productNumber: string; url: string }[] {
  const out: { supplier: string; productNumber: string; url: string }[] = [];
  for (const m of markings) {
    const ada = m.match(/adafru\.it\/(\d{2,6})/i) ?? m.match(/adafruit\.com\/products?\/(\d{2,6})/i);
    if (ada) out.push({ supplier: "Adafruit", productNumber: ada[1]!, url: `https://www.adafruit.com/product/${ada[1]}` });
    const spark = m.match(/sparkfun\.com\/products\/(\d{3,6})/i);
    if (spark) out.push({ supplier: "SparkFun", productNumber: spark[1]!, url: `https://www.sparkfun.com/products/${spark[1]}` });
  }
  return out.filter((l, i) => out.findIndex((o) => o.url === l.url) === i);
}

/**
 * A name with any number-like token that isn't printed on the part taken out (DEC-053): the model
 * is told not to invent a series or a number, and this is the guard behind that. "Kycon KPPX-4P
 * plug" with nothing printed becomes "Kycon plug"; a printed number stays.
 */
export function withoutUnprintedNumbers(name: string, markings: string[]): string {
  const printed = markings.map(squash).join(" ");
  const kept = name.split(/\s+/).filter((token) => {
    const bare = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    // "2-pin", "4-way", "12V", "5mm", "2x20": a count, size or rating, not a part number.
    const descriptive = /^\d+(\.\d+)?-?(mm|cm|in|v|vdc|vac|a|ma|w|k|m|uf|nf|pf|ohm|ohms|hz|khz|mhz|pin|pins|p|pcs|x|awg|way|ways|wire|wires|core|lead|leads|pole|poles|position|positions|pos|ch|channel|channels|bit|row|rows|strand|conductor|conductors|speed|stage|layer|axis|slot|slots|pack|pc|piece|pieces|ft|m|cell|cells)$/i.test(bare) || /^\d+x\d+$/i.test(bare);
    const numberLike = bare.length >= 3 && /\d/.test(bare) && (/[A-Za-z]/.test(bare) || /-/.test(bare) || /^\d{6,}$/.test(bare)) && !descriptive;
    return !numberLike || printed.includes(squash(bare));
  });
  return kept.join(" ").replace(/\s+([,;:)])/g, "$1").replace(/[\s,;:(-]+$/g, "").trim();
}

/**
 * What on the part could be a maker's or a shop's part number: a token with letters and digits
 * (or a dashed all-digit number such as a Digi-Key one), four characters or more, that isn't a
 * date, a web address or plain words. Longest first; at most four.
 */
export function partNumberCandidates(markings: string[]): string[] {
  const out = new Set<string>();
  for (const m of markings) {
    for (const raw of m.split(/[\s,;:|()]+/)) {
      const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      if (token.length < 4 || token.length > 32) continue;
      if (/[./]/.test(token) && /\.[a-z]{2,}(\/|$)/i.test(token)) continue; // a web address
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(token) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(token)) continue; // a date
      if (/^\d+(\.\d+)?(awg|mm|cm|in|v|vdc|vac|mv|kv|a|ma|ua|w|mw|kw|wh|kwh|mah|ah|k|m|uf|nf|pf|mf|ohm|ohms|r|hz|khz|mhz|ghz|rpm|g|kg|mg|ml|l|oz|lb|lbs|pin|pins|p|pcs|pk|x)$/i.test(token)) continue; // a size or rating
      if (/^\d+x\d+$/i.test(token)) continue; // 2x20: a header's pins, not a number
      if (/[°%]/.test(token)) continue; // 105°C, 5%: a rating
      const letters = /[A-Za-z]/.test(token);
      const digits = /\d/.test(token);
      if (letters && digits) out.add(token);
      else if (digits && /-/.test(token) && token.length >= 6) out.add(token); // 1528-1938-ND style, or 806-KPPX-4P without letters? no: with dashes and digits only
    }
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 4);
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

/** "None", "N/A", "unknown": the model saying it has nothing, which is not a value. */
const PLACEHOLDER = /^(none|n\/a|na|null|unknown|not (specified|available|found|known)|unspecified|-+|\?+)$/i;

function clean(field: string, value: string): string {
  let v = value.trim();
  if (PLACEHOLDER.test(v)) return "";
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

/**
 * The extract answer. Normally whole JSON; when the model runs into the length cap the JSON stops
 * mid-way, and throwing it all away showed "nothing to suggest" for a page that had been read
 * perfectly well. So a cut-off answer keeps every suggestion that was written out whole.
 */
function parseExtract(raw: string, likelyPart: string): { identified: string; suggestions: Suggestion[]; notes: string[]; cutOff: boolean } {
  try {
    const whole = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { identified?: string; suggestions?: Suggestion[]; notes?: string[] };
    if (Array.isArray(whole.suggestions)) return { identified: whole.identified || likelyPart, suggestions: whole.suggestions, notes: whole.notes ?? [], cutOff: false };
  } catch {
    // fall through: not whole
  }
  const suggestions: Suggestion[] = [];
  for (const m of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      const s = JSON.parse(m[0]) as Suggestion;
      if (typeof s.field === "string" && typeof s.value === "string") suggestions.push(s);
    } catch {
      // not a finished suggestion
    }
  }
  let identified = likelyPart;
  const id = raw.match(/"identified"\s*:\s*("(?:[^"\\]|\\.)*")/);
  try {
    if (id) identified = (JSON.parse(id[1]!) as string) || likelyPart;
  } catch {
    // keep the photo's guess
  }
  return { identified, suggestions, notes: [], cutOff: true };
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
/** First of each by `key`: "LP103450" and "lp-103450" are one number. */
const uniqBy = (xs: string[], key: (x: string) => string) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => x && !seen.has(key(x)) && seen.add(key(x)));
};
const nonEmpty = (s: string) => (s ? [s] : []);

/**
 * The naming rule (DEC-065): the kind of thing first, then what tells it apart, so the names of
 * one kind group together and read alike. The owner's own names, when there are any, outrank it.
 */
export const NAMING = `Name it the way the owner's labels read: the kind of thing first, then the values that tell it apart from others of its kind (voltage, capacity, size, length, pins, count), then a brand or model only when it is printed and matters. Like "LiPo battery 3.7 V 1200 mAh", "Socket cap screw M3 × 10", "JST PH 2.0 cable 2-pin", "Stepper driver A4988", "Claw hammer". Never a slogan or a line of label copy ("Rechargeable Lipo Battery", "Please use according to specification"), never a sentence.`;

/** The owner's names (DEC-065): the category's own, or a few from each when it isn't known yet. */
export function namesGuide(names: Record<string, string[]> | undefined, category: string | null): string {
  if (!names) return "";
  if (category) {
    const list = (names[category] ?? []).slice(0, 12);
    if (list.length === 0) return "";
    return `The owner's names for parts already in ${category}: ${list.map((n) => `"${n}"`).join(", ")}. Write the name the way these are written (word order, units, abbreviations), which outranks the examples above. If this is the same kind of thing as one of them, name it the same way and change only the values that differ; if it is the very same part, use that name exactly.`;
  }
  const lines = Object.entries(names)
    .filter(([, l]) => l.length > 0)
    .map(([c, l]) => `${c}: ${l.slice(0, 3).map((n) => `"${n}"`).join(", ")}`);
  return lines.length ? `Some of the owner's names, by category: ${lines.join("; ")}. Write the name the way these are written, which outranks the examples above; if it is the very same part as one of them, use that name exactly.` : "";
}

/** Words too common to tie a hit to its query. */
const COMMON = new Set(["the", "and", "for", "with", "from", "datasheet", "supplier", "buy", "price", "pdf", "part", "parts"]);

/**
 * A search hit is on topic when its title, snippet or address shares a word with the query
 * (DEC-066). Bing, taking the app for a bot, has answered part numbers with film and adult sites.
 */
export function onTopic(hit: Hit, query: string): boolean {
  const words = (query.toLowerCase().match(/[a-z0-9]+(?:[.\-][a-z0-9]+)*/g) ?? []).filter((w) => w.length >= 3 && !COMMON.has(w));
  if (words.length === 0) return true;
  const text = `${hit.title} ${hit.snippet} ${hit.url}`.toLowerCase();
  const flat = squash(text);
  return words.some((w) => text.includes(w) || (squash(w).length >= 3 && flat.includes(squash(w))));
}

export type { ChatMessage, ResearchResult, Suggestion };
