import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { X } from "lucide-react";

/** Full-screen camera scanner; gives the same result as the hardware scanner (PRD F1). */
export function CameraScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setError("The camera needs HTTPS. Open the app through its Tailscale https:// address.");
      return;
    }
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let done = false;
    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result, _err, ctl) => {
        if (result && !done) {
          done = true;
          ctl.stop();
          onResultRef.current(result.getText().trim());
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop();
      })
      .catch((e: Error) => setError(`Couldn't start the camera: ${e.message}`));
    return () => controls?.stop();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-lg font-semibold">Scan a sticker</span>
        <button onClick={onClose} aria-label="Close camera" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
          <X size={22} />
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-60 w-60 rounded-2xl border-2 border-accent/80" />
        </div>
        {error && <p className="absolute inset-x-4 top-4 rounded-lg bg-surface p-4 text-danger">{error}</p>}
      </div>
    </div>
  );
}
