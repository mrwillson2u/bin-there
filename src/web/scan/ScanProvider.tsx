import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeCode } from "../../shared/api";
import { ScanDetector, type Scan } from "./detector";
import { primeFeedback } from "./feedback";
import { cameraAllowed, getScanMethod } from "../settings";
// The barcode decoder is large; only download it when the camera is first opened.
const CameraScanner = lazy(() => import("./CameraScanner").then((m) => ({ default: m.CameraScanner })));

/** Return true if the scan was handled; otherwise it falls through to the next handler. */
export type ScanHandler = (code: string) => boolean | void;

/** How the camera should behave for whoever opened it. */
export type CameraOptions = {
  /** Wait for a tap on Scan instead of taking the first code seen (use when the scan writes something). */
  tap?: boolean;
  title?: string;
  hint?: string;
  /** Called when the camera goes away, with or without a scan (DEC-084: a wait a button started ends with its camera). */
  onClose?: () => void;
};

type ScanContextValue = {
  /** Feed a code in from any source (scanner, camera, manual entry). */
  submit: (code: string) => void;
  /** Open the camera; calling it again while open just updates the options. Usable straight as an onClick. */
  openCamera: (options?: CameraOptions | { nativeEvent: unknown }) => void;
  closeCamera: () => void;
  cameraOpen: boolean;
  register: (handler: ScanHandler) => () => void;
  /** A screen saying what a scan does right now (DEC-044); the bar shows it. */
  registerTarget: (label: string, camera?: CameraOptions, floating?: boolean) => () => void;
  /** The current target sits in a sheet that covers the phone's bar, so the Scan button floats over the sheet (DEC-085). */
  floating: boolean;
  target: string | null;
  /** The camera options of the screen's scan target, so every Scan button opens the camera the same way (issue #1). */
  targetCamera: CameraOptions | null;
  lastScan: { code: string; at: number } | null;
};

const ScanContext = createContext<ScanContextValue | null>(null);

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan outside ScanProvider");
  return ctx;
}

/** While mounted, scans go to `handler` first (most recently mounted wins). */
export function useScanHandler(handler: ScanHandler) {
  const { register } = useScan();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => register((code) => ref.current(code)), [register]);
}

/**
 * While mounted, the bar says a scan does `what` (DEC-044). Use it wherever a `useScanHandler`
 * acts on a scan; `ScanTarget` does it for you.
 */
/** For a sheet that covers the phone's bar: true while the Scan button floats over it, so it can leave room at its bottom (DEC-085). */
export function useScanFloat(): boolean {
  return useScan().floating;
}

export function useScanTarget(what: string | null, camera?: CameraOptions, floating = false) {
  const { registerTarget } = useScan();
  const { tap, title, hint } = camera ?? {};
  useEffect(() => {
    if (!what) return;
    return registerTarget(what, tap || title || hint ? { tap, title, hint } : undefined, floating);
  }, [registerTarget, what, tap, title, hint, floating]);
}

/** Remove characters a prefix-less scan already typed into the focused field. */
function removeLeakedChars(count: number) {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || count <= 0) return;
  const end = el.selectionStart ?? el.value.length;
  const start = Math.max(0, end - count);
  const next = el.value.slice(0, start) + el.value.slice(end);
  // Use the native setter so React's controlled inputs see the change.
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.setSelectionRange(start, start);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ScanProvider({ fallback, children }: { fallback: (code: string) => void; children: ReactNode }) {
  const handlers = useRef<ScanHandler[]>([]);
  const [camera, setCamera] = useState<CameraOptions | null>(null);
  const cameraRef = useRef<CameraOptions | null>(null);
  cameraRef.current = camera;
  // The camera goes away: after a scan (from it or from a hardware scanner while it's open) or when it's closed.
  const endCamera = useCallback(() => {
    const was = cameraRef.current;
    cameraRef.current = null;
    setCamera(null);
    was?.onClose?.();
  }, []);
  const [lastScan, setLastScan] = useState<{ code: string; at: number } | null>(null);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const submit = useCallback((raw: string) => {
    const code = normalizeCode(raw);
    if (!code) return;
    setLastScan({ code, at: Date.now() });
    for (const h of [...handlers.current].reverse()) {
      if (h(code) === true) return;
    }
    fallbackRef.current(code);
  }, []);

  const register = useCallback((h: ScanHandler) => {
    handlers.current.push(h);
    return () => {
      handlers.current = handlers.current.filter((x) => x !== h);
    };
  }, []);
  // The most recently mounted target wins, like handlers.
  const [targets, setTargets] = useState<{ id: number; label: string; camera?: CameraOptions; floating: boolean }[]>([]);
  const nextId = useRef(0);
  const registerTarget = useCallback((label: string, camera?: CameraOptions, floating = false) => {
    const id = nextId.current++;
    setTargets((t) => [...t, { id, label, camera, floating }]);
    return () => setTargets((t) => t.filter((x) => x.id !== id));
  }, []);
  const target = targets.at(-1)?.label ?? null;
  const targetCamera = targets.at(-1)?.camera ?? null;
  const floating = targets.at(-1)?.floating ?? false;

  useEffect(() => {
    const detector = new ScanDetector((scan: Scan) => {
      if (scan.leaked) removeLeakedChars(scan.leaked);
      submit(scan.code);
      if (cameraRef.current?.onClose) endCamera();
    });
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const action = detector.handleKey({
        key: e.key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        time: e.timeStamp,
      });
      if (action === "block") {
        e.preventDefault();
        e.stopPropagation();
      }
      clearTimeout(idleTimer);
      if (detector.scanning) {
        idleTimer = setTimeout(() => detector.handleIdle(performance.now()), detector.prefixIdleMs + 10);
      }
    };
    // Belt and braces: if a browser inserts text despite preventDefault on keydown.
    const onBeforeInput = (e: Event) => {
      if (detector.scanning) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("beforeinput", onBeforeInput, { capture: true });
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("beforeinput", onBeforeInput, { capture: true });
    };
  }, [submit, endCamera]);

  const openCamera = useCallback((options: CameraOptions | { nativeEvent: unknown } = {}) => {
    primeFeedback(); // this runs in the tap that opened the camera, so the beep is allowed later
    // On a scanner-only device the camera never opens for scanning (DEC-044); the screens don't offer it either.
    if (!cameraAllowed(getScanMethod())) return;
    setCamera("nativeEvent" in options ? {} : options);
  }, []);
  const closeCamera = endCamera;
  const value = { submit, openCamera, closeCamera, cameraOpen: camera !== null, register, registerTarget, target, targetCamera, floating, lastScan };

  return (
    <ScanContext.Provider value={value}>
      {children}
      {camera && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <CameraScanner
            tap={camera.tap}
            title={camera.title}
            hint={camera.hint}
            onResult={(code) => {
              submit(code);
              endCamera();
            }}
            onClose={closeCamera}
          />
        </Suspense>
      )}
    </ScanContext.Provider>
  );
}
