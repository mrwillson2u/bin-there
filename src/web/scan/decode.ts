// QR decoding for the camera scanner. The browser's own BarcodeDetector is used
// where it really works (Chrome on Android); everywhere else the ZXing C++ decoder
// compiled to WebAssembly (zxing-wasm), served from this app so it works with no
// internet. Both are loaded only when the camera is first opened.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

type Detector = { detect(source: ImageData): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
  }
}

type Decode = (frame: ImageData) => Promise<string | null>;
let chosen: Promise<Decode> | undefined;

async function choose(): Promise<Decode> {
  const BD = window.BarcodeDetector;
  if (BD) {
    try {
      if ((await BD.getSupportedFormats()).includes("qr_code")) {
        const d = new BD({ formats: ["qr_code"] });
        return async (frame) => (await d.detect(frame))[0]?.rawValue ?? null;
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
  const options = { formats: ["QRCode" as const], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 1 };
  return async (frame) => (await z.readBarcodes(frame, options))[0]?.text ?? null;
}

/** The text of the first QR code in the frame, or null. */
export function decodeFrame(frame: ImageData): Promise<string | null> {
  chosen ??= choose();
  return chosen.then((decode) => decode(frame));
}
