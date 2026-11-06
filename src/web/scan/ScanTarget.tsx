import type { ReactNode } from "react";
import { ScanLine } from "lucide-react";
import { useScan, useScanTarget, type CameraOptions } from "./ScanProvider";
import { cameraAllowed, scannerExpected, useScanMethod } from "../settings";
import { Button, Card } from "../components/ui";

// The one way the app says "a scan goes here" (DEC-044): a box outlined in the scan colour, the
// scan icon, and a line saying what a scan does right now. What's inside follows the device's
// scanning setting: a camera button, a word about the scanner's trigger, or both. While it's on
// screen the bar says the same thing, so a glance at the same corner always tells you whether a
// scan will do something or just open something. A scan writes only where one of these shows.

type Props = {
  /** What a scan does now: "Scan where it's going", "Scan the sticker for Bin 0042". */
  what: string;
  /** Camera options for this target (tap: wait for the Scan button; use when the scan writes). */
  camera?: CameraOptions;
  /** Other ways to do the same thing (Pick from list) and Cancel. */
  actions?: ReactNode;
  /** One line (inside a form) instead of a card. */
  compact?: boolean;
  /** Bigger, for a screen that is mostly about scanning (put-back). */
  big?: boolean;
  children?: ReactNode;
  className?: string;
};

export function ScanTarget({ what, camera, actions, compact, big, children, className = "" }: Props) {
  const { openCamera } = useScan();
  const method = useScanMethod();
  useScanTarget(what);
  const withCamera = cameraAllowed(method);
  const withScanner = scannerExpected(method);
  const trigger = withScanner ? (withCamera ? "or pull the scanner's trigger" : "Pull the scanner's trigger") : null;

  if (compact) {
    return (
      <div className={`flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-scan/60 px-3 py-1.5 ${className}`} data-scan-target>
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-scan">
          <ScanLine size={18} className="shrink-0" /> {what}
        </span>
        {trigger && <span className="text-[13px] text-muted">{trigger}</span>}
        {withCamera && (
          <Button variant="scan" onClick={() => openCamera(camera)} className="min-h-9 px-3 text-sm" aria-label={`${what}: open the camera`}>
            Camera
          </Button>
        )}
        {actions}
      </div>
    );
  }
  return (
    <Card className={`flex flex-col gap-3 border-scan/70 p-4 ${className}`} data-scan-target>
      <p className={`flex items-center gap-2 font-semibold text-scan ${big ? "text-lg" : ""}`}>
        <ScanLine size={big ? 24 : 20} className="shrink-0" /> {what}
      </p>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {withCamera && (
          <Button variant="scan" onClick={() => openCamera(camera)} className={big ? "min-h-14 flex-1 text-lg" : ""}>
            <ScanLine size={big ? 22 : 18} /> Scan with camera
          </Button>
        )}
        {trigger && <span className={`text-sm text-muted ${big && !withCamera ? "text-base" : ""}`}>{trigger}</span>}
        {actions}
      </div>
    </Card>
  );
}
