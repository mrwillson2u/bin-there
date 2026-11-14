import { parseBagCode, type BagCode } from "../../shared/bagcode";
import { zxing } from "../scan/decode";

// Look for a shop bag's 2D barcode in a photo just taken (DEC-074). Runs on the device, on the
// full photo before it's shrunk for upload, since the code is a small part of the picture.
// Finding nothing is the usual case and never an error.

/** The bag's code in this photo, or null. */
export async function readBagCode(file: Blob): Promise<BagCode | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const z = await zxing();
    // Whole photo first; a 12-megapixel photo is tried again at half size, where a large code reads better.
    for (const maxSide of [3200, 1600]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      if (maxSide === 1600 && scale === 1) break;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const found = await z.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
        formats: ["DataMatrix", "QRCode", "PDF417"],
        textMode: "Plain",
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 6,
      });
      for (const r of found) {
        const bag = r.isValid && r.text ? parseBagCode(r.text) : null;
        if (bag) return bag;
      }
    }
  } catch {
    // A photo the decoder can't take is just a photo with no bag code.
  }
  return null;
}
