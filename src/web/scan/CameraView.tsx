import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SwitchCamera } from "lucide-react";
import { boundsOf, frameToView, guideRect, lensName, pickCamera, pickTarget, visibleRect, type CameraInfo, type Rect, type Seen } from "./camera";
import { decodeFrame } from "./decode";

// A live camera preview that looks for QR codes and shows what it sees: brackets
// around every code in view, green ones around the code nearest the aim mark, with
// that code's text (and, if the parent says, whose it is) underneath. It never acts
// on a code itself; it reports the aimed-at one and the parent decides (DEC-022).
// The lens is the plain back camera unless you pick another; the choice is remembered.

const LENS_KEY = "bin-there:camera";
/** The aim mark's side, as a share of the view's shorter edge. */
export const AIM = 0.5;
/** A code counts as "in view" this long after it was last read. */
const KEEP_MS = 450;
const FRAME_MS = 90;

export type Tone = "ok" | "warn" | "info" | "danger" | "muted";
export type CodeNote = { text: string; tone: Tone } | null;

const noteTone: Record<Tone, string> = {
  ok: "bg-ok text-white",
  warn: "bg-warn text-white",
  info: "bg-info text-white",
  danger: "bg-danger text-white",
  muted: "bg-black/70 text-white",
};

export function CameraView({
  onTarget,
  note,
  className = "",
}: {
  /** The code nearest the aim mark, or null when there's none in view. */
  onTarget: (code: string | null) => void;
  /** What to say under the aimed-at code (e.g. "on Bin 5"). */
  note?: (code: string) => CodeNote;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cams, setCams] = useState<CameraInfo[]>([]);
  const [lens, setLens] = useState<string | null>(() => localStorage.getItem(LENS_KEY));
  const [seen, setSeen] = useState<Seen[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const onTargetRef = useRef(onTarget);
  onTargetRef.current = onTarget;

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("The camera needs HTTPS. Open the app through its Tailscale https:// address.");
      return;
    }
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const recent = new Map<string, { box: Rect; at: number }>();
    let tick = 0;
    let lastTarget: string | null = null;

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const report = (view: { w: number; h: number }) => {
      const now = performance.now();
      for (const [k, v] of recent) if (now - v.at > KEEP_MS) recent.delete(k);
      const list = [...recent].map(([text, v]) => ({ text, box: v.box }));
      setSeen(list);
      const t = pickTarget(list, view)?.text ?? null;
      if (t !== lastTarget) {
        lastTarget = t;
        setTarget(t);
        onTargetRef.current(t);
      }
    };

    const loop = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.clientWidth > 0) {
        const vsize = { w: video.videoWidth, h: video.videoHeight };
        const view = { w: video.clientWidth, h: video.clientHeight };
        // Alternate: the area round the aim mark at full resolution (small stickers),
        // then everything on screen, shrunk (so brackets show wherever a code is).
        const aimed = tick++ % 2 === 0;
        const r = aimed ? guideRect(vsize, view, AIM, 0.3) : visibleRect(vsize, view);
        const scale = aimed ? 1 : Math.min(1, 1280 / Math.max(r.w, r.h));
        canvas.width = Math.max(1, Math.round(r.w * scale));
        canvas.height = Math.max(1, Math.round(r.h * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
          try {
            const found = await decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (stopped) return;
            const now = performance.now();
            for (const f of found) {
              const pts = f.corners.map((p) => frameToView({ x: r.x + p.x / scale, y: r.y + p.y / scale }, vsize, view));
              recent.set(f.text.trim(), { box: boundsOf(pts), at: now });
            }
            report(view);
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
        if (!id) {
          setError(`Couldn't start the camera: ${(e as Error).message}`);
          return;
        }
        // That lens is gone (or refused): forget it and take whatever faces away from the user.
        localStorage.removeItem(LENS_KEY);
        id = null;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } }).catch((e2: Error) => {
          setError(`Couldn't start the camera: ${e2.message}`);
          return undefined;
        });
        if (!stream) return;
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
      if (want && want !== got && known.some((c) => c.deviceId === got)) {
        // Started on the default (lens-hopping) camera; switch to the plain one (re-runs this effect).
        setLens(want);
        return;
      }
      void loop();
    };

    void start();
    return () => {
      stop();
      if (lastTarget !== null) onTargetRef.current(null);
    };
  }, [lens]);

  const switchLens = () => {
    if (cams.length < 2) return;
    const i = cams.findIndex((c) => c.deviceId === lens);
    const next = cams[(i + 1) % cams.length]!;
    localStorage.setItem(LENS_KEY, next.deviceId);
    setLens(next.deviceId);
  };

  const current = cams.findIndex((c) => c.deviceId === lens);
  const targetBox = seen.find((s) => s.text === target)?.box;
  const targetNote = target ? (note?.(target) ?? null) : null;

  return (
    <div className={`relative overflow-hidden bg-black ${className}`} style={{ containerType: "size" }}>
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* Where to aim. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: `${AIM * 100}cqmin`, height: `${AIM * 100}cqmin` }}>
          <Brackets className="text-white/60" thin />
        </div>
        {seen.map((s) => (
          <div key={s.text} className="absolute" style={padded(s.box)} data-seen={s.text} data-target={s.text === target || undefined}>
            <Brackets className={s.text === target ? "text-ok" : "text-white/70"} thin={s.text !== target} />
          </div>
        ))}
      </div>
      {target && targetBox && (
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ left: targetBox.x + targetBox.w / 2, top: Math.min(targetBox.y + targetBox.h + 14, (videoRef.current?.clientHeight ?? 9999) - 64) }}
          aria-live="polite"
        >
          <span className="rounded-lg bg-black/75 px-2.5 py-1 font-mono text-lg font-bold text-white">{target}</span>
          {targetNote && <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${noteTone[targetNote.tone]}`}>{targetNote.text}</span>}
        </div>
      )}
      {cams.length > 1 && (
        <button type="button" onClick={switchLens} aria-label="Switch lens" className="absolute right-2 top-2 flex h-10 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm text-white">
          <SwitchCamera size={16} /> {current >= 0 ? lensName(cams[current]!.label, current) : "Lens"}
        </button>
      )}
      {error && <p className="absolute inset-x-3 top-3 rounded-lg bg-surface p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

const padded = (b: Rect): CSSProperties => {
  const pad = Math.max(6, Math.min(b.w, b.h) * 0.12);
  return { left: b.x - pad, top: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2 };
};

/** Four corner marks filling the parent. */
function Brackets({ className, thin = false }: { className: string; thin?: boolean }) {
  const w = thin ? "border-[3px]" : "border-[5px]";
  const corner = "absolute h-[28%] w-[28%] min-h-3 min-w-3 border-current";
  return (
    <div className={`absolute inset-0 ${className}`}>
      <span className={`${corner} ${w} left-0 top-0 rounded-tl-lg border-b-0 border-r-0`} />
      <span className={`${corner} ${w} right-0 top-0 rounded-tr-lg border-b-0 border-l-0`} />
      <span className={`${corner} ${w} bottom-0 left-0 rounded-bl-lg border-r-0 border-t-0`} />
      <span className={`${corner} ${w} bottom-0 right-0 rounded-br-lg border-l-0 border-t-0`} />
    </div>
  );
}
