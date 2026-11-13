// Web search through SearXNG (DEC-048): the self-hosted meta-search already running on
// ubuntubot, so research costs nothing per lookup. Pages are fetched and boiled down to
// text for the model to read.

export type Hit = { title: string; url: string; snippet: string };
export type Search = (query: string) => Promise<Hit[]>;
export type FetchPage = (url: string) => Promise<string | null>;
/** The text of a PDF's first pages (a datasheet), or null when it can't be fetched or isn't a PDF. */
export type ReadPdf = (url: string) => Promise<string | null>;

/**
 * `engines` (SEARCH_ENGINES, DEC-066) names the engines to ask, comma-separated, instead of the
 * service's own defaults: SearXNG lets a request use an engine its settings leave off.
 */
export function searxng(url: string, fetchImpl: typeof fetch = fetch, engines?: string | null): Search {
  return async (query) => {
    const u = new URL("/search", url);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("language", "en");
    if (engines) u.searchParams.set("engines", engines);
    const res = await fetchImpl(u, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Search failed (${res.status} from SearXNG)`);
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[]; unresponsive_engines?: [string, string][] };
    // Nothing back and the engines say why (CAPTCHA, too many requests): that's a failure to report, not an empty answer.
    if (!(data.results ?? []).length && data.unresponsive_engines?.length) {
      throw new Error(`the search engines didn't answer: ${data.unresponsive_engines.map(([e, why]) => `${e} (${why})`).join(", ")}`);
    }
    return (data.results ?? [])
      .filter((r) => r.url && r.title)
      .slice(0, 10)
      .map((r) => ({ title: r.title!, url: r.url!, snippet: r.content ?? "" }));
  };
}

const MAX_PAGE_BYTES = 1_500_000;
export const MAX_PAGE_CHARS = 7000;

/** The page as plain text, cut to what a small model can read; null if it can't be fetched or isn't a page. */
export function pageFetcher(fetchImpl: typeof fetch = fetch): FetchPage {
  return async (url) => {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BinThere/1.0; garage inventory, one page per part)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        redirect: "follow",
      });
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return null;
      const buf = await res.arrayBuffer();
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_PAGE_BYTES));
      return htmlToText(html).slice(0, MAX_PAGE_CHARS);
    } catch {
      return null;
    }
  };
}

/**
 * Good-enough HTML to text: scripts, styles, menus, headers, footers and tags out, entities in,
 * whitespace squeezed. Shop pages open with hundreds of menu links; dropping them leaves room
 * for the part itself within the characters the model gets.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|p|div|li|tr|h[1-6]|table|section|article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export const MAX_PDF_CHARS = 5000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_PAGES = 3;

/**
 * A datasheet's first pages as text (DEC-053): fetched with a browser-like agent, refused past
 * 15 MB or when it isn't a PDF, read with pdf.js, the first three pages'
 * words joined and capped. The front of a datasheet is the title, the features and the key
 * ratings, which is what the category's fields want.
 */
export function pdfReader(fetchImpl: typeof fetch = fetch): ReadPdf {
  return async (url) => {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) BinThere/1.0", Accept: "application/pdf,*/*" }, signal: AbortSignal.timeout(20_000) });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("pdf") && !/\.pdf(\?|$)/i.test(url)) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_PDF_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES || bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return null;
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
      const parts: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, PDF_PAGES); i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }
      const text = parts.join("\n").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
      return text.length > 40 ? text.slice(0, MAX_PDF_CHARS) : null;
    } catch {
      return null;
    }
  };
}
