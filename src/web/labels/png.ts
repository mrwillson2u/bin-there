// A sticker sheet as a PNG for Cricut Print Then Cut (DEC-052): the page's SVG drawn onto a
// canvas at print resolution with a transparent background, so Design Space cuts around each
// white label. Done in the browser, so the server needs no image library.

import { PT_PER_INCH, pageSvg, type Page } from "../../shared/labels";

export async function pageToPng(page: Page, dpi = 300): Promise<Blob> {
  const svg = pageSvg(page);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The sheet's drawing couldn't be loaded"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((page.width / PT_PER_INCH) * dpi);
    canvas.height = Math.round((page.height / PT_PER_INCH) * dpi);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
