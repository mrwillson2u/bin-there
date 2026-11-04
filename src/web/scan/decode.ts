// QR decoding for the camera. The browser's own BarcodeDetector is used where it
// really works (Chrome on Android); everywhere else the ZXing C++ decoder compiled
// to WebAssembly (zxing-wasm), served from this app so it works with no internet.
// Both are loaded only when the camera is first opened.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import type { Point } from "./camera";

type Detected = { rawValue: string; cornerPoints: Point[] };
type Detector = { detect(source: ImageData): Promise<Detected[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
  }
}

/** A code found in the image, with its four corners in the image's pixels. */
export type Found = { text: string; corners: Point[] };
type Decode = (frame: ImageData) => Promise<Found[]>;
let chosen: Promise<Decode> | undefined;

async function choose(): Promise<Decode> {
  const BD = window.BarcodeDetector;
  if (BD) {
    try {
      if ((await BD.getSupportedFormats()).includes("qr_code")) {
        const d = new BD({ formats: ["qr_code"] });
        return async (frame) => (await d.detect(frame)).map((r) => ({ text: r.rawValue, corners: r.cornerPoints }));
      }
    } catch {
      // Not usable here; fall through to the WebAssembly decoder.
    }
  }
  const z = await import("zxing-wasm/reader");
  z.prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  const options = { formats: ["QRCode" as const], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 4 };
  return async (frame) =>
    (await z.readBarcodes(frame, options))
      .filter((r) => r.isValid && r.text)
      .map((r) => ({ text: r.text, corners: [r.position.topLeft, r.position.topRight, r.position.bottomRight, r.position.bottomLeft] }));
}

/** Every QR code in the frame (usually zero or one). */
export function decodeFrame(frame: ImageData): Promise<Found[]> {
  chosen ??= choose();
  return chosen.then((decode) => decode(frame));
}
