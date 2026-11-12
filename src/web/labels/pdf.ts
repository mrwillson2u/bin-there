// A sticker sheet as a PDF (DEC-052): one page per sheet, drawn from the shared layout with
// pdf-lib's built-in Helvetica, so the file prints at scale on any machine with nothing embedded.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import type { Page } from "../../shared/labels";

function colour(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Only the characters the standard font can draw; anything else (an arrow, an emoji) is left out. */
function drawable(text: string, font: PDFFont): string {
  const set = new Set(font.getCharacterSet());
  return [...text].filter((c) => set.has(c.codePointAt(0)!)).join("");
}

export async function pagesToPdf(pages: Page[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Stickers");
  doc.setProducer("Bin There");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
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
        const font = s.bold ? bold : regular;
        const text = drawable(s.text, font);
        if (!text) continue;
        // The layout's anchor is in the text's own direction; a middle anchor backs up half the width along it.
        const rad = (s.rotation * Math.PI) / 180;
        const back = s.anchor === "middle" ? font.widthOfTextAtSize(text, s.size) / 2 : 0;
        const x = s.x - back * Math.cos(rad);
        const y = s.y - back * Math.sin(rad);
        p.drawText(text, { x, y: H - y, size: s.size, font, color: colour(s.color), rotate: degrees(-s.rotation) });
      }
    }
  }
  return doc.save();
}
