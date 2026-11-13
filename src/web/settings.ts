// Settings kept on this device (DEC-043, DEC-044): how scanning works here, and the beep.
// The theme lives in theme.ts. All of these are localStorage, so they're per phone or computer.
import { useSyncExternalStore } from "react";

/** What "scan" means on this device: the camera, the hardware scanner, or both. */
export const scanMethods = ["both", "camera", "scanner"] as const;
export type ScanMethod = (typeof scanMethods)[number];
export const scanMethodLabels: Record<ScanMethod, string> = {
  both: "Camera and scanner",
  camera: "Camera only",
  scanner: "Scanner only",
};
export const scanMethodHints: Record<ScanMethod, string> = {
  both: "Scan buttons open the camera, and the hardware scanner works on every screen too.",
  camera: "A phone without a scanner: scan buttons open the camera.",
  scanner: "A station with a scanner and no camera: the camera never opens for scanning, and every screen says when a scan will do something.",
};

const SCAN_KEY = "bin-there:scan-method";
const listeners = new Set<() => void>();

export function getScanMethod(): ScanMethod {
  const v = localStorage.getItem(SCAN_KEY);
  // The first version of this setting (DEC-043) stored "scanner-only" for what is now "scanner",
  // and "scanner" for a Stickers screen that started with the scanner but kept the camera ("both").
  if (v === "scanner-only") return "scanner";
  if (v === "scanner" && localStorage.getItem(SCAN_KEY + ":v") !== "2") return "both";
  return scanMethods.includes(v as ScanMethod) ? (v as ScanMethod) : "both";
}

export function setScanMethod(m: ScanMethod) {
  localStorage.setItem(SCAN_KEY, m);
  localStorage.setItem(SCAN_KEY + ":v", "2");
  for (const l of listeners) l();
}

/** The setting, live: the bar and every scan target follow a change at once. */
export function useScanMethod(): ScanMethod {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getScanMethod,
  );
}

export const cameraAllowed = (m: ScanMethod) => m !== "scanner";
