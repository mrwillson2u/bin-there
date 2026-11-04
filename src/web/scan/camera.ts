// Pure helpers for the camera scanner (unit-tested): which lens to use and which
// part of the frame to hand to the decoder.

export type CameraInfo = { deviceId: string; label: string };

/** Lenses that switch by themselves (iOS "Dual"/"Triple" virtual cameras) or aren't the plain 1× one. */
const NOT_PLAIN = /dual|triple|ultra|wide|tele|macro|zoom/i;

/**
 * The lens to scan with: the one chosen before if it's still there, else the plain
 * back camera. On iPhones the default "environment" camera is a virtual one that
 * hops between lenses as you move closer, which is what makes a sticker hunt for
 * focus; the plain "Back Camera" stays on one lens and focuses close enough.
 */
export function pickCamera(cams: CameraInfo[], saved: string | null): string | null {
  if (cams.length === 0) return null;
  if (saved && cams.some((c) => c.deviceId === saved)) return saved;
  const back = cams.filter((c) => /back|rear|environment/i.test(c.label) && !/front|user/i.test(c.label));
  const plain = back.find((c) => /^back camera$/i.test(c.label.trim())) ?? back.find((c) => !NOT_PLAIN.test(c.label)) ?? back[0];
  return (plain ?? cams[0]!).deviceId;
}

/** A short name for the lens button. */
export function lensName(label: string, index: number): string {
  const l = label.toLowerCase();
  if (/front|user/.test(l)) return "Front";
  if (/ultra/.test(l)) return "Ultra wide";
  if (/tele/.test(l)) return "Telephoto";
  if (/dual|triple/.test(l)) return "Auto lens";
  if (/back|rear|environment/.test(l)) return "Main";
  return label.trim() ? label.trim().slice(0, 14) : `Camera ${index + 1}`;
}

export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The part of the video frame that sits under the square guide drawn in the middle
 * of the view (the video is shown with object-fit: cover). `fraction` is the guide's
 * side as a share of the view's shorter edge; `margin` widens the crop a little so a
 * sticker just outside the square still reads.
 */
export function guideRect(video: Size, view: Size, fraction = 0.6, margin = 0.2): Rect {
  const scale = Math.max(view.w / video.w, view.h / video.h);
  const sideView = fraction * Math.min(view.w, view.h) * (1 + margin);
  const side = sideView / scale;
  // The view shows the middle of the scaled frame, so the view's centre is the frame's centre.
  const x = clamp(video.w / 2 - side / 2, 0, video.w);
  const y = clamp(video.h / 2 - side / 2, 0, video.h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.min(side, video.w - x)), h: Math.round(Math.min(side, video.h - y)) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Point = { x: number; y: number };
/** A code the camera can see right now, with its outline in view pixels. */
export type Seen = { text: string; box: Rect };

/** The part of the frame the view actually shows (the video is drawn with object-fit: cover). */
export function visibleRect(video: Size, view: Size): Rect {
  const scale = Math.max(view.w / video.w, view.h / video.h);
  const w = Math.min(video.w, view.w / scale);
  const h = Math.min(video.h, view.h / scale);
  return { x: Math.round((video.w - w) / 2), y: Math.round((video.h - h) / 2), w: Math.round(w), h: Math.round(h) };
}

/** A point in the frame to the same point in the view (object-fit: cover). */
export function frameToView(p: Point, video: Size, view: Size): Point {
  const scale = Math.max(view.w / video.w, view.h / video.h);
  return { x: (p.x - video.w / 2) * scale + view.w / 2, y: (p.y - video.h / 2) * scale + view.h / 2 };
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The code to act on: the one nearest the middle of the view, where the aim mark is.
 * A code whose middle is off-screen doesn't count, so a neighbouring bin's sticker
 * half in view is never the one scanned.
 */
export function pickTarget(seen: Seen[], view: Size): Seen | null {
  let best: Seen | null = null;
  let bestD = Infinity;
  for (const s of seen) {
    const cx = s.box.x + s.box.w / 2;
    const cy = s.box.y + s.box.h / 2;
    if (cx < 0 || cy < 0 || cx > view.w || cy > view.h) continue;
    const d = Math.hypot(cx - view.w / 2, cy - view.h / 2);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
