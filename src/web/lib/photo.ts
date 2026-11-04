import type { PhotoCrop } from "../../shared/api";

// Phone photos are 3–12 MB. Shrink them on the device before upload: the garage is on cell.

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo"));
    };
    img.src = url;
  });
}

function toJpeg(img: HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo"))), "image/jpeg", quality),
  );
}

/** The square of the photo a crop picks out, in the photo's own pixels. Null = centred, as big as fits. */
export function cropRect(w: number, h: number, crop: PhotoCrop | null) {
  const short = Math.min(w, h);
  const side = (crop?.size ?? 1) * short;
  const x = crop ? crop.x * w : (w - side) / 2;
  const y = crop ? crop.y * h : (h - side) / 2;
  // Keep it inside the photo whatever rounding did.
  return { x: Math.max(0, Math.min(x, w - side)), y: Math.max(0, Math.min(y, h - side)), side };
}

/** A square JPEG of the cropped part of an image (DEC-030). */
export function squareJpeg(img: HTMLImageElement, crop: PhotoCrop | null, side = 360, quality = 0.78): Promise<Blob> {
  const r = cropRect(img.naturalWidth, img.naturalHeight, crop);
  const out = Math.round(Math.min(side, r.side));
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  canvas.getContext("2d")!.drawImage(img, r.x, r.y, r.side, r.side, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo"))), "image/jpeg", quality),
  );
}

/** The original, shrunk to 1600 px, and a square thumbnail from its centre (adjustable later). */
export async function preparePhoto(file: Blob): Promise<{ photo: Blob; thumb: Blob }> {
  const img = await loadImage(file);
  return { photo: await toJpeg(img, 1600, 0.82), thumb: await squareJpeg(img, null) };
}
