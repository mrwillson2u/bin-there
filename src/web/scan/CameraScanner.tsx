import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, SwitchCamera, X } from "lucide-react";
import { guideRect, lensName, pickCamera, type CameraInfo } from "./camera";
import { decodeFrame } from "./decode";

// Full-screen camera scanner; gives the same result as the hardware scanner (PRD F1).
// It reads the part of the frame under the square guide at full resolution (plus,
// now and then, the whole frame shrunk) so a small sticker reads without being
// pushed right up to the lens. The lens is the plain back camera unless you pick
// another; the choice is remembered (DEC-021).

const LENS_KEY = "bin-there:camera";
const GUIDE = 0.6;
/** The same code is reported again only after it has been out of view this long. */
const REPEAT_MS = 2500;
const FRAME_MS = 120;

export type CameraScannerProps = {
  onResult: (code: string) => void;
  onClose: () => void;
  /** Keep scanning after a read instead of closing (labelling a row of bins). */
  continuous?: boolean;
  title?: string;
  hint?: string;
  /** Extra controls in the top bar, e.g. a Skip button. */
  extra?: ReactNode;
};

export function CameraScanner({ onResult, onClose, continuous = false, title = "Scan a sticker", hint, extra }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cams, setCams] = useState<CameraInfo[]>([]);
  const [lens, setLens] = useState<string | null>(() => localStorage.getItem(LENS_KEY));
  const [flash, setFlash] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("The camera needs HTTPS. Open the app through its Tailscale https:// address.");
      return;
    }
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const last = { code: "", at: 0 };
    let tick = 0;

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const loop = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const whole = tick++ % 4 === 3;
        const r = whole ? { x: 0, y: 0, w: vw, h: vh } : guideRect({ w: vw, h: vh }, { w: video.clientWidth, h: video.clientHeight }, GUIDE);
        const scale = whole ? Math.min(1, 800 / r.w) : 1;
        canvas.width = Math.max(1, Math.round(r.w * scale));
        canvas.height = Math.max(1, Math.round(r.h * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
          try {
            const code = await decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (code && !stopped) {
              const now = Date.now();
              const fresh = code !== last.code || now - last.at > REPEAT_MS;
              last.code = code;
              last.at = now;
              if (fresh) {
                navigator.vibrate?.(60);
                if (continuousRef.current) {
                  setFlash(code);
                  onResultRef.current(code);
                } else {
                  stop();
                  onResultRef.current(code);
                  return;
                }
              }
            }
          } catch (e) {
            setError(`The scanner couldn't load: ${(e as Error).message}`);
            stop();
            return;
          }
        }
      }
      timer = setTimeout(loop, FRAME_MS);
    };

    const list = async () =>
      (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").map((d) => ({ deviceId: d.deviceId, label: d.label }));

    const start = async () => {
      // With permission already given, the lenses are known up front and we can go straight to the right one.
      let id = lens;
      if (!id) {
        const known = await list();
        if (known.some((c) => c.label)) id = pickCamera(known, null);
      }
      const video: MediaTrackConstraints = {
        ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video });
      } catch (e) {
        if (id) {
          // That lens is gone (or refused): forget it and take whatever faces away from the user.
          localStorage.removeItem(LENS_KEY);
          id = null;
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } }).catch((e2: Error) => {
            setError(`Couldn't start the camera: ${e2.message}`);
            return undefined;
          });
          if (!stream) return;
        } else {
          setError(`Couldn't start the camera: ${(e as Error).message}`);
          return;
        }
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const el = videoRef.current;
      if (!el) return;
      el.srcObject = stream;
      await el.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      // Keep refocusing where the browser lets us; ignored elsewhere.
      track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      const known = await list();
      setCams(known);
      const want = pickCamera(known, id);
      const got = track?.getSettings().deviceId ?? null;
      if (want && want !== got) {
        // Started on the default lens; switch to the plain one (re-runs this effect).
        setLens(want);
        return;
      }
      if (want && want !== lens) setLens(want);
      void loop();
    };

    void start();
    return stop;
  }, [lens]);

  const switchLens = () => {
    if (cams.length < 2) return;
    const i = cams.findIndex((c) => c.deviceId === lens);
    const next = cams[(i + 1) % cams.length]!;
    localStorage.setItem(LENS_KEY, next.deviceId);
    setLens(next.deviceId);
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const current = cams.findIndex((c) => c.deviceId === lens);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</span>
        {extra}
        {cams.length > 1 && (
          <button
            type="button"
            onClick={switchLens}
            aria-label="Switch lens"
            className="flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm"
          >
            <SwitchCamera size={18} /> {current >= 0 ? lensName(cams[current]!.label, current) : "Lens"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close camera" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
          <X size={22} />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-[60vmin] w-[60vmin] rounded-2xl border-2 border-accent/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          <p className="rounded-full bg-black/50 px-3 py-1 text-sm">{hint ?? "Fill the square with the sticker"}</p>
        </div>
        {flash && (
          <p className="absolute inset-x-4 top-4 flex items-center justify-center gap-2 rounded-xl bg-ok px-4 py-3 font-semibold text-white" role="status">
            <Check size={20} /> <span className="font-mono">{flash}</span>
          </p>
        )}
        {error && <p className="absolute inset-x-4 top-4 rounded-lg bg-surface p-4 text-danger">{error}</p>}
      </div>
    </div>
  );
}
