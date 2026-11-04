// A beep and a buzz when a scan is taken (DEC-022). Sound uses Web Audio, which a
// phone only allows after a tap, so primeFeedback() is called from the tap that
// opens the camera. Android buzzes through navigator.vibrate; iPhone Safari has no
// vibrate, but toggling a hidden switch control gives a light haptic tick (iOS 18+).

const SOUND_KEY = "bin-there:sound";
let ctx: AudioContext | null = null;

export const soundOn = () => localStorage.getItem(SOUND_KEY) !== "off";
export const setSound = (on: boolean) => localStorage.setItem(SOUND_KEY, on ? "on" : "off");

/** Call from a tap so later beeps are allowed to play. */
export function primeFeedback() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // No Web Audio: stay quiet.
  }
}

function tone(freq: number, at: number, length: number, type: OscillatorType, volume: number) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function buzz(pattern: number | number[]) {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
    return;
  }
  // iOS: a click on a <input type="checkbox" switch> plays the system haptic.
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** The scan was taken. */
export function scanOk() {
  buzz(50);
  if (!soundOn()) return;
  primeFeedback();
  tone(1760, 0, 0.11, "sine", 0.2);
}

/** Nothing to scan, or the scan was refused. */
export function scanBad() {
  buzz([70, 60, 70]);
  if (!soundOn()) return;
  primeFeedback();
  tone(320, 0, 0.12, "square", 0.08);
  tone(320, 0.18, 0.12, "square", 0.08);
}
