// Web search through SearXNG (DEC-048): the self-hosted meta-search already running on
// ubuntubot, so research costs nothing per lookup. Pages are fetched and boiled down to
// text for the model to read.

export type Hit = { title: string; url: string; snippet: string };
export type Search = (query: string) => Promise<Hit[]>;
export type FetchPage = (url: string) => Promise<string | null>;

export function searxng(url: string, fetchImpl: typeof fetch = fetch): Search {
  return async (query) => {
    const u = new URL("/search", url);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("language", "en");
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
export const MAX_PAGE_CHARS = 6000;

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

/** Good-enough HTML to text: scripts, styles and tags out, entities in, whitespace squeezed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
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
