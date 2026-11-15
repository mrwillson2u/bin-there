import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScanLine } from "lucide-react";
import { useScan, useScanTarget, type CameraOptions } from "./ScanProvider";
import { cameraAllowed, useScanMethod } from "../settings";
import { Button } from "../components/ui";
import { useWide } from "../lib/useWide";

// The one way the app says "a scan goes here" (DEC-044): a box outlined in the scan colour, the
// scan icon, and a line saying what a scan does right now. What's inside follows the device's
// scanning setting: a camera button or not. Nothing tells you how to work a scanner (Colin,
// 2026-11-13: it goes without saying, and some scanners have no trigger). While it's on
// screen the bar says the same thing, so a glance at the same corner always tells you whether a
// scan will do something or just open something. A scan writes only where one of these shows.
//
// On a phone the bar's Scan button is the one camera button (issue #1, DEC-083): a target on a
// page has no camera button of its own, and one that is only its words isn't drawn at all, since
// the note above the Scan button says them. Inside a sheet that covers the bar (the bin sheet,
// the Move sheet, the Stickers screen) the target keeps its words and its camera button, since
// the bar can't be reached from there.

type Props = {
  /** What a scan does now: "Scan where it's going", "Scan the sticker for Bin 0042". */
  what: string;
  /** Camera options for this target (tap: wait for the Scan button; use when the scan writes). */
  camera?: CameraOptions;
  /**
   * For a wait a button started ("Replace sticker"): how to end it. On a phone with the camera
   * allowed, the camera opens straight away and the wait ends when it goes away, so there is no
   * box and no extra tap (DEC-084).
   */
  cancel?: () => void;
  /** Other ways to do the same thing (Pick from list) and Cancel. */
  actions?: ReactNode;
  /** One line (inside a form) instead of a card. */
  compact?: boolean;
  /** Bigger, for a screen that is mostly about scanning (put-back). */
  big?: boolean;
  children?: ReactNode;
  className?: string;
};

export function ScanTarget({ what, camera, cancel, actions, compact, big, children, className = "" }: Props) {
  const { openCamera } = useScan();
  const method = useScanMethod();
  useScanTarget(what, camera);
  const wide = useWide();
  // Whether this target sits in something laid over the page (position: fixed), which covers the phone's bar.
  const ref = useRef<HTMLElement | null>(null);
  const [covered, setCovered] = useState(true);
  useLayoutEffect(() => {
    let over = false;
    for (let el = ref.current?.parentElement; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).position === "fixed") {
        over = true;
        break;
      }
    }
    setCovered(over);
  }, []);
  const onBar = !wide && !covered;
  const direct = !!cancel && !wide && cameraAllowed(method);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    if (direct) openCamera({ ...camera, onClose: () => cancelRef.current?.() });
    // Once, when the wait starts.
  }, [direct]);
  const withCamera = cameraAllowed(method) && !onBar;
  const set = (el: HTMLElement | null) => {
    ref.current = el;
  };

  // The camera is the wait: nothing to draw.
  if (direct) return <span ref={set} hidden data-scan-target-quiet />;
  // Only its words, and the bar's note says them.
  if (onBar && compact && !actions && !children) return <span ref={set} hidden data-scan-target-quiet />;

  if (compact) {
    return (
      <div className={`flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-scan/60 px-3 py-1.5 ${className}`} data-scan-target ref={set}>
        {/* The words keep a sensible width on a phone, so the buttons wrap under them instead of squeezing them to a word a line. */}
        <span className="flex min-w-[12rem] flex-1 items-center gap-2 text-sm font-semibold text-scan">
          <ScanLine size={18} className="shrink-0" /> {what}
        </span>
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
    <div className={`flex flex-col gap-3 rounded-2xl border border-scan/70 bg-surface p-4 ${className}`} data-scan-target ref={set}>
      <p className={`flex items-center gap-2 font-semibold text-scan ${big ? "text-lg" : ""}`}>
        <ScanLine size={big ? 24 : 20} className="shrink-0" /> {what}
      </p>
      {children}
      {/* On a phone the big button takes the row, so its words never wrap. */}
      <div className={`flex flex-wrap items-center gap-2 ${big ? "flex-col items-stretch sm:flex-row sm:items-center" : ""}`}>
        {withCamera && (
          <Button variant="scan" onClick={() => openCamera(camera)} className={`whitespace-nowrap ${big ? "min-h-14 text-lg sm:flex-1" : ""}`}>
            <ScanLine size={big ? 22 : 18} /> Scan with camera
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
