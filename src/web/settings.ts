// Settings kept on this device (DEC-043): how the Stickers screen starts, and the scan beep.
// The theme lives in theme.ts. All of these are localStorage, so they're per phone or computer.

export const scanMethods = ["camera", "scanner", "scanner-only"] as const;
export type ScanMethod = (typeof scanMethods)[number];
export const scanMethodLabels: Record<ScanMethod, string> = {
  camera: "Camera",
  scanner: "Scanner",
  "scanner-only": "Scanner only",
};
export const scanMethodHints: Record<ScanMethod, string> = {
  camera: "The Stickers screen opens with the camera preview. A pull of the scanner's trigger still switches it.",
  scanner: "The Stickers screen opens ready for the hardware scanner, with the camera a tap away.",
  "scanner-only": "The Stickers screen never shows the camera. For a station with a scanner and no camera.",
};

const SCAN_KEY = "bin-there:scan-method";

export function getScanMethod(): ScanMethod {
  const v = localStorage.getItem(SCAN_KEY);
  return scanMethods.includes(v as ScanMethod) ? (v as ScanMethod) : "camera";
}

export function setScanMethod(m: ScanMethod) {
  localStorage.setItem(SCAN_KEY, m);
}
