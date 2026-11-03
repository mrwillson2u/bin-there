import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeCode } from "../../shared/api";
import { ScanDetector, type Scan } from "./detector";
// The barcode decoder is large; only download it when the camera is first opened.
const CameraScanner = lazy(() => import("./CameraScanner").then((m) => ({ default: m.CameraScanner })));

/** Return true if the scan was handled; otherwise it falls through to the next handler. */
export type ScanHandler = (code: string) => boolean | void;

type ScanContextValue = {
  /** Feed a code in from any source (scanner, camera, manual entry). */
  submit: (code: string) => void;
  openCamera: () => void;
  register: (handler: ScanHandler) => () => void;
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
  const [cameraOpen, setCameraOpen] = useState(false);
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

  useEffect(() => {
    const detector = new ScanDetector((scan: Scan) => {
      if (scan.leaked) removeLeakedChars(scan.leaked);
      submit(scan.code);
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
  }, [submit]);

  const value = { submit, openCamera: () => setCameraOpen(true), register, lastScan };

  return (
    <ScanContext.Provider value={value}>
      {children}
      {cameraOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <CameraScanner
            onResult={(code) => {
              setCameraOpen(false);
              submit(code);
            }}
            onClose={() => setCameraOpen(false)}
          />
        </Suspense>
      )}
    </ScanContext.Provider>
  );
}
