import { useEffect, useRef, useState } from "react";
import { ScanLine, Volume2, VolumeX, X } from "lucide-react";
import type { ItemDetail, ScanResult } from "../../shared/api";
import { api } from "../api";
import { CameraView, type CodeNote } from "./CameraView";
import { scanBad, scanOk, setSound, soundOn } from "./feedback";

// Full-screen camera scanner; gives the same result as the hardware scanner (PRD F1).
// It never takes a code by itself (DEC-096): one code is highlighted, its name shown, and the
// button at the bottom takes it, so what's taken is what you chose even with several stickers
// in view. Another sticker in view is chosen by tapping its marker. It beeps and buzzes when
// it takes one (DEC-022).

export type CameraScannerProps = {
  onResult: (code: string) => void;
  onClose: () => void;
  /** Nothing is waiting for the scan, so it opens what's scanned: the button says "Open …". */
  opens?: boolean;
  title?: string;
  hint?: string;
};

/** What a sticker is, for the button and the label under the highlight. */
type Known = { name: string; fresh?: boolean };
async function whatIs(code: string): Promise<Known> {
  const r = await api<ScanResult>(`/scan/${encodeURIComponent(code)}`);
  if (r.kind === "location") return { name: r.location.name };
  if (r.kind === "unit") return { name: (await api<ItemDetail>(`/items/${r.itemId}`)).name || "a part" };
  return { name: `new sticker ${code}`, fresh: true };
}

export function CameraScanner({ onResult, onClose, opens = false, title = "Scan a sticker", hint }: CameraScannerProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  const [sound, setSoundState] = useState(soundOn);
  const taken = useRef(false);
  // What each sticker seen is, looked up once.
  const [known, setKnown] = useState<Record<string, Known>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!target || asked.current.has(target)) return;
    asked.current.add(target);
    whatIs(target)
      .then((k) => setKnown((all) => ({ ...all, [target]: k })))
      .catch(() => {});
  }, [target]);

  const take = (code: string) => {
    if (taken.current) return;
    taken.current = true;
    scanOk();
    onResult(code);
  };

  const onTarget = (code: string | null) => {
    setTarget(code);
    if (code) setMiss(false);
  };
  const note = (code: string): CodeNote => {
    const k = known[code];
    return k ? { text: k.name, tone: k.fresh ? "info" : "ok" } : null;
  };
  const name = target ? (known[target]?.name ?? target) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => { setSound(!sound); setSoundState(!sound); }}
          aria-label={sound ? "Turn the beep off" : "Turn the beep on"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"
        >
          {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button type="button" onClick={onClose} aria-label="Close camera" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
          <X size={22} />
        </button>
      </div>
      <CameraView onTarget={onTarget} note={note} className="flex-1" />
      <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-sm text-white/80" data-camera-hint>
          {miss
            ? "No sticker in the green brackets yet. Aim the white corners at it."
            : (hint ?? (target ? "The one in green is the one you'll get. For another in view, tap its circle." : "Aim the white corners at a sticker."))}
        </p>
        <button
          type="button"
          data-camera-take
          onClick={() => {
            if (target) take(target);
            else {
              scanBad();
              setMiss(true);
            }
          }}
          className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl px-3 text-lg font-semibold ${target ? "bg-accent text-accent-fg" : "bg-white/15 text-white/70"}`}
        >
          <ScanLine size={22} className="shrink-0" /> <span className="truncate">{name ? `${opens ? "Open" : "Scan"} ${name}` : "Scan"}</span>
        </button>
      </div>
    </div>
  );
}
