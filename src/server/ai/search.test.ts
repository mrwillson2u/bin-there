import { describe, expect, it } from "vitest";
import { htmlToText, pageFetcher, searxng } from "./search";

describe("htmlToText", () => {
  it("drops scripts, styles and tags, keeps the words with line breaks at blocks", () => {
    const html = `<html><head><title>LM2596</title><style>p{}</style><script>var x=1;</script></head>
      <body><h1>LM2596 &amp; friends</h1><p>Input: 4&ndash;40&nbsp;V</p><ul><li>3 A</li><li>&#8220;adjustable&#8221;</li></ul></body></html>`;
    expect(htmlToText(html)).toBe("LM2596\nLM2596 & friends\nInput: 4&ndash;40 V\n3 A\n“adjustable”");
  });
});

describe("searxng", () => {
  it("asks for JSON and keeps the first ten hits with a title and a URL", async () => {
    let asked = "";
    const search = searxng("http://searx.local:8080", (async (u: URL | string) => {
      asked = String(u);
      return new Response(JSON.stringify({ results: [{ title: "A", url: "https://a", content: "aa" }, { title: "", url: "https://b" }, ...Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, url: `https://t${i}` }))] }));
    }) as typeof fetch);
    const hits = await search("LM2596 datasheet");
    expect(asked).toBe("http://searx.local:8080/search?q=LM2596+datasheet&format=json&language=en");
    expect(hits).toHaveLength(10);
    expect(hits[0]).toEqual({ title: "A", url: "https://a", snippet: "aa" });
    expect(hits[1]).toEqual({ title: "T0", url: "https://t0", snippet: "" });
  });

  it("names the engines to ask when given (DEC-066)", async () => {
    let asked = "";
    const search = searxng("http://searx.local:8080", (async (u: URL | string) => {
      asked = String(u);
      return new Response(JSON.stringify({ results: [] }));
    }) as typeof fetch, "yandex,brave");
    await search("LM2596");
    expect(asked).toBe("http://searx.local:8080/search?q=LM2596&format=json&language=en&engines=yandex%2Cbrave");
  });
});

describe("pageFetcher", () => {
  it("returns text for HTML pages, null for anything else or a failure", async () => {
    const fetchPage = pageFetcher((async (u: URL | string) => {
      const url = String(u);
      if (url.endsWith(".pdf")) return new Response("%PDF", { headers: { "content-type": "application/pdf" } });
      if (url.includes("down")) throw new Error("ECONNREFUSED");
      return new Response("<p>Hello <b>there</b></p>", { headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch);
    expect(await fetchPage("https://x/page")).toBe("Hello there");
    expect(await fetchPage("https://x/data.pdf")).toBeNull();
    expect(await fetchPage("https://down/")).toBeNull();
  });
});
