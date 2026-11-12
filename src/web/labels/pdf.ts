// A sticker sheet as a PDF (DEC-052): one page per sheet, drawn from the shared layout with
// pdf-lib's built-in Helvetica, so the file prints at scale on any machine with nothing embedded.
// Helvetica has no arrow, and the title is "Bin→There", so a character it lacks is drawn with the
// built-in Symbol font when that has it (the arrow, Greek, maths) and left out otherwise.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import type { Page } from "../../shared/labels";

function colour(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Run = { text: string; font: PDFFont };

/** The text as runs, each in the first font that can draw it; a character no font has is left out. */
function runs(text: string, fonts: PDFFont[], sets: Set<number>[]): Run[] {
  const out: Run[] = [];
  for (const ch of text) {
    const i = sets.findIndex((s) => s.has(ch.codePointAt(0)!));
    if (i < 0) continue;
    const last = out[out.length - 1];
    if (last && last.font === fonts[i]) last.text += ch;
    else out.push({ text: ch, font: fonts[i]! });
  }
  return out;
}

export async function pagesToPdf(pages: Page[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Stickers");
  doc.setProducer("Bin There");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const symbol = await doc.embedFont(StandardFonts.Symbol);
  const symbolSet = new Set(symbol.getCharacterSet());
  const regularSet = new Set(regular.getCharacterSet());
  const boldSet = new Set(bold.getCharacterSet());
  for (const page of pages) {
    const p = doc.addPage([page.width, page.height]);
    const H = page.height;
    for (const s of page.shapes) {
      if (s.kind === "rect") {
        // PDF's origin is the bottom-left corner.
        p.drawRectangle({
          x: s.x,
          y: H - s.y - s.h,
          width: s.w,
          height: s.h,
          ...(s.fill ? { color: colour(s.fill) } : {}),
          ...(s.stroke ? { borderColor: colour(s.stroke), borderWidth: 0.25 } : {}),
        });
      } else {
        const parts = s.bold ? runs(s.text, [bold, symbol], [boldSet, symbolSet]) : runs(s.text, [regular, symbol], [regularSet, symbolSet]);
        if (parts.length === 0) continue;
        const widths = parts.map((r) => r.font.widthOfTextAtSize(r.text, s.size));
        const total = widths.reduce((a, b) => a + b, 0);
        // The layout's anchor is in the text's own direction; a middle anchor backs up half the
        // width along it, and each run starts where the one before ended.
        const rad = (s.rotation * Math.PI) / 180;
        const [dx, dy] = [Math.cos(rad), Math.sin(rad)];
        let along = s.anchor === "middle" ? -total / 2 : 0;
        parts.forEach((r, i) => {
          const x = s.x + along * dx;
          const y = s.y + along * dy;
          p.drawText(r.text, { x, y: H - y, size: s.size, font: r.font, color: colour(s.color), rotate: degrees(-s.rotation) });
          along += widths[i]!;
        });
      }
    }
  }
  return doc.save();
}
