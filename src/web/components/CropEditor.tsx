import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail, Photo, PhotoCrop } from "../../shared/api";
import { savePhotoCrop } from "../api";
import { cropRect, squareJpeg } from "../lib/photo";
import { useToast } from "./Toast";
import { Button } from "./ui";

/**
 * Pick the square a photo shows as (DEC-030): drag the square, zoom with the slider. The full
 * photo is kept, so this can be changed again any time.
 */
export function CropEditor({ itemId, photo, onClose }: { itemId: number; photo: Photo; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // The square in the photo's own pixels.
  const [sq, setSq] = useState<{ x: number; y: number; side: number } | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onLoad = (img: HTMLImageElement) => {
    const d = { w: img.naturalWidth, h: img.naturalHeight };
    setDims(d);
    setSq(cropRect(d.w, d.h, photo.crop));
  };
  const short = dims ? Math.min(dims.w, dims.h) : 1;
  const clamp = (s: { x: number; y: number; side: number }) =>
    dims ? { side: s.side, x: Math.max(0, Math.min(s.x, dims.w - s.side)), y: Math.max(0, Math.min(s.y, dims.h - s.side)) } : s;
  // Screen pixels per photo pixel, for dragging.
  const scale = () => (boxRef.current && dims ? boxRef.current.clientWidth / dims.w : 1);

  const zoom = (size: number) =>
    setSq((s) => {
      if (!s) return s;
      const side = size * short;
      return clamp({ side, x: s.x + (s.side - side) / 2, y: s.y + (s.side - side) / 2 });
    });

  const save = useMutation({
    mutationFn: async () => {
      if (!sq || !dims || !imgRef.current) throw new Error("The photo hasn't loaded yet");
      const crop: PhotoCrop = { x: sq.x / dims.w, y: sq.y / dims.h, size: Math.min(1, sq.side / short) };
      return savePhotoCrop<ItemDetail>(photo.id, crop, await squareJpeg(imgRef.current, crop));
    },
    onSuccess: (item) => {
      qc.setQueryData(["item", itemId], item);
      for (const key of ["items", "location", "pins"]) qc.invalidateQueries({ queryKey: [key] });
      toast.show({ message: "Crop saved" });
      onClose();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/70" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label="Crop the photo"
        data-sheet
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[95dvh] max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:rounded-3xl"
      >
        <div>
          <p className="font-semibold">Crop the photo</p>
          <p className="text-[13px] text-muted">Drag the square over the part. The whole photo is kept.</p>
        </div>
        <div ref={boxRef} className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl bg-black" style={dims ? { maxWidth: `min(100%, calc(60dvh * ${dims.w / dims.h}))` } : undefined}>
          <img ref={imgRef} src={photo.url} alt="" draggable={false} onLoad={(e) => onLoad(e.currentTarget)} className="block w-full" />
          {sq && dims && (
            <div
              role="slider"
              aria-label="Crop square"
              aria-valuetext={`${Math.round((sq.side / short) * 100)}% of the photo`}
              tabIndex={0}
              className="absolute cursor-move rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{ left: pct(sq.x, dims.w), top: pct(sq.y, dims.h), width: pct(sq.side, dims.w), height: pct(sq.side, dims.h) }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { px: e.clientX, py: e.clientY, x: sq.x, y: sq.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const k = scale();
                setSq(clamp({ side: sq.side, x: d.x + (e.clientX - d.px) / k, y: d.y + (e.clientY - d.py) / k }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = short * 0.02;
                const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
                const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
                if (dx || dy) {
                  e.preventDefault();
                  setSq(clamp({ ...sq, x: sq.x + dx, y: sq.y + dy }));
                }
              }}
            >
              {/* Thirds, to line the part up. */}
              <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="border border-white/25" />
                ))}
              </span>
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-muted">
          Zoom
          <input
            type="range"
            min={30}
            max={100}
            value={sq ? Math.round((1 - sq.side / short) * 70 + 30) : 30}
            onChange={(e) => zoom(1 - (Number(e.target.value) - 30) / 70)}
            aria-label="Zoom"
            className="flex-1 accent-[var(--color-accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => save.mutate()} disabled={!sq || save.isPending}>
            {save.isPending ? "Saving…" : "Save crop"}
          </Button>
          <Button onClick={() => dims && setSq(cropRect(dims.w, dims.h, null))} disabled={!dims}>
            Centre
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </section>
    </>
  );
}
