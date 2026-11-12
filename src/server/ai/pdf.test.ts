import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { MAX_PDF_CHARS, pdfReader } from "./search";

// Reading a datasheet's first pages (DEC-053) with pdf.js, against a PDF made here with pdf-lib.

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const p = doc.addPage([612, 792]);
    lines.forEach((line, i) => p.drawText(line, { x: 50, y: 700 - i * 20, size: 11, font }));
  }
  return doc.save();
}

describe("pdfReader", () => {
  it("gives the first three pages' words, capped, and nothing for what isn't a PDF", async () => {
    const bytes = await makePdf([
      ["LM2596 SIMPLE SWITCHER 3A Step-Down Voltage Regulator", "Input voltage range: 4.5 V to 40 V. Package: TO-263."],
      ["Page two: absolute maximum ratings"],
      ["Page three: electrical characteristics"],
      ["Page four: never read"],
    ]);
    const asked: string[] = [];
    const read = pdfReader((async (u: URL | string | Request, init?: RequestInit) => {
      asked.push(String(u));
      expect((init?.headers as Record<string, string>)["User-Agent"]).toContain("BinThere");
      if (String(u).endsWith("/nope.html")) return new Response("<p>not a pdf</p>", { headers: { "content-type": "text/html" } });
      if (String(u).endsWith("/gone.pdf")) return new Response("no", { status: 404 });
      return new Response(new Blob([bytes as unknown as BlobPart]), { headers: { "content-type": "application/pdf" } });
    }) as typeof fetch);
    const text = await read("https://www.ti.com/lit/ds/lm2596.pdf");
    expect(text).toContain("LM2596 SIMPLE SWITCHER 3A Step-Down Voltage Regulator");
    expect(text).toContain("Input voltage range: 4.5 V to 40 V. Package: TO-263.");
    expect(text).toContain("Page three");
    expect(text).not.toContain("Page four");
    expect(text!.length).toBeLessThanOrEqual(MAX_PDF_CHARS);
    expect(await read("https://example.com/nope.html")).toBeNull();
    expect(await read("https://example.com/gone.pdf")).toBeNull();
    expect(asked).toHaveLength(3);
  });
});
