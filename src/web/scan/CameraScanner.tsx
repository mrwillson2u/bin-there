import { useEffect, useRef, useState } from "react";
import { ScanLine, Volume2, VolumeX, X } from "lucide-react";
import { CameraView } from "./CameraView";
import { scanBad, scanOk, setSound, soundOn } from "./feedback";

// Full-screen camera scanner; gives the same result as the hardware scanner (PRD F1).
// For looking things up it takes the first code aimed at. When the scan writes
// something (a sticker onto a bin), `tap` mode waits for the Scan button, so what's
// taken is what you chose (DEC-022). Either way it beeps and buzzes when it takes one.

export type CameraScannerProps = {
  onResult: (code: string) => void;
  onClose: () => void;
  /** Wait for a tap on Scan instead of taking the first code seen. */
  tap?: boolean;
  title?: string;
  hint?: string;
};

/** How long a code must stay the aimed-at one before it's taken without a tap. */
const HOLD_MS = 300;

export function CameraScanner({ onResult, onClose, tap = false, title = "Scan a sticker", hint }: CameraScannerProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  const [sound, setSoundState] = useState(soundOn);
  const taken = useRef(false);

  const take = (code: string) => {
    if (taken.current) return;
    taken.current = true;
    scanOk();
    onResult(code);
  };

  // Without a tap, a code is taken only when it sits on the aim mark and has stayed the nearest
  // one for a moment (DEC-095): with stickers stacked close together, the one read first is often
  // a neighbour, not the one in the brackets.
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hold.current), []);
  const onTarget = (code: string | null, aimed: boolean) => {
    setTarget(code);
    if (code) setMiss(false);
    clearTimeout(hold.current);
    if (!tap && code && aimed) hold.current = setTimeout(() => take(code), HOLD_MS);
  };

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
      <CameraView onTarget={onTarget} className="flex-1" />
      <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-sm text-white/80">
          {miss ? "No sticker in the green brackets yet. Aim the white corners at it." : (hint ?? (tap ? "Aim at the sticker; when it's in green brackets, tap Scan." : "Put the sticker inside the white corners."))}
        </p>
        {tap && (
          <button
            type="button"
            onClick={() => {
              if (target) take(target);
              else {
                scanBad();
                setMiss(true);
              }
            }}
            className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl text-lg font-semibold ${target ? "bg-accent text-accent-fg" : "bg-white/15 text-white/70"}`}
          >
            <ScanLine size={22} /> {target ? `Scan ${target}` : "Scan"}
          </button>
        )}
      </div>
    </div>
  );
}
