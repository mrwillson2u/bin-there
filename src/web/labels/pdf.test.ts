import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_STYLE, getTemplate, layoutPages } from "../../shared/labels";
import { pagesToPdf } from "./pdf";

// The die-cut sheet PDF (DEC-052): Letter pages at scale, Helvetica, and the arrow in "Bin→There"
// drawn with the built-in Symbol font rather than dropped.

describe("pagesToPdf", () => {
  it("writes one Letter page per sheet with the built-in fonts, the arrow from Symbol", async () => {
    const pages = layoutPages(getTemplate("SL588"), ["EddY9xhVRwAg", "8WjAoohGcsr2"], { ...DEFAULT_STYLE, title: "Bin→There", subtitle: "Inventory tag" });
    const bytes = await pagesToPdf(pages);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([612, 792]);
    // The fonts, read through pdf-lib (the file's objects are compressed, so the bytes don't show them).
    const objects = doc.context.enumerateIndirectObjects().map(([, o]) => o.toString());
    const fonts = objects.filter((o) => o.includes("/Type /Font")).map((o) => o.match(/\/BaseFont \/([\w-]+)/)?.[1]).sort();
    expect(fonts).toEqual(["Helvetica", "Helvetica-Bold", "Symbol"]);
    // Two sheets' worth makes two pages.
    expect((await PDFDocument.load(await pagesToPdf(layoutPages(getTemplate("SL588"), Array.from({ length: 90 }, (_, i) => `code${i}`))))).getPageCount()).toBe(2);
  });
});
