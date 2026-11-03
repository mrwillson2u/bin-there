import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { binSizeLabels, type BinSize, type LocationDetail, type LocationSummary } from "../../shared/api";
import { DEFAULT_GRID, STRIP_HEIGHT, footprint, snapSlot, type Grid, type PlacedBin, type Slot } from "../../shared/grid";
import { binColors } from "./ui";

// The gridded box drawn as it sits on the bench: a grid of cells with the front
// strip along the bottom. Bins show in their real colors in their slots. In
// arrange mode a bin follows the finger (or mouse) and snaps into the nearest
// free slot when let go; dropping it in the tray below takes it off the grid.

type Bin = LocationSummary;

type Drag = {
  bin: Bin;
  rotated: boolean;
  /** Pointer offset from the bin's top-left corner, in px. */
  grabX: number;
  grabY: number;
  /** Where the pointer started and is now, in viewport px. */
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** The slot it will land in, "tray" to take it off, or null for nowhere. */
  target: Slot | "tray" | null;
  /** Where it was dropped before snapping, for the red "no room" outline. */
  want: Slot | null;
};

const TAP_SLOP = 6;

export function BoxGrid({
  box,
  arranging,
  onPlace,
  onProblem,
}: {
  box: LocationDetail;
  arranging: boolean;
  onPlace: (bin: Bin, slot: Slot | null) => void;
  onProblem: (message: string) => void;
}) {
  const grid: Grid = box.grid ?? DEFAULT_GRID;
  const bins = box.children.filter((c) => c.type === "bin");
  const placed = bins.filter((b): b is Bin & { slot: Slot } => b.slot !== null);
  const tray = bins.filter((b) => b.slot === null);

  const gridRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(48);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setCellPx(el.getBoundingClientRect().width / grid.cols);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid.cols]);

  const [drag, setDrag] = useState<Drag | null>(null);

  // Percent geometry of the box: cells are square, the strip row is a bit shorter.
  const totalRows = grid.rows + STRIP_HEIGHT;
  const cw = 100 / grid.cols;
  const ch = 100 / totalRows;
  const rect = (slot: Slot, size: BinSize | null): CSSProperties => {
    const fp = footprint(size, slot.rotated, grid);
    const strip = slot.y === grid.rows;
    return {
      left: `${slot.x * cw}%`,
      top: `${slot.y * ch}%`,
      width: `${fp.w * cw}%`,
      height: `${(strip ? STRIP_HEIGHT : fp.h) * ch}%`,
    };
  };

  const others = (except: number): PlacedBin[] =>
    placed.filter((b) => b.id !== except).map((b) => ({ id: b.id, binSize: b.binSize, slot: b.slot }));

  const start = (bin: Bin) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!arranging || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setDrag({
      bin,
      rotated: bin.slot?.rotated ?? false,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      target: null,
      want: null,
    });
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return;
    // Top-left of the dragged bin relative to the grid, in cells.
    const left = (e.clientX - drag.grabX - g.left) / cellPx;
    const top = (e.clientY - drag.grabY - g.top) / cellPx;
    const fp = footprint(drag.bin.binSize, drag.rotated, grid);
    const inTray = e.clientY - drag.grabY + (fp.h * cellPx) / 2 > g.bottom + cellPx * 0.25;
    let target: Drag["target"] = null;
    let want: Slot | null = null;
    if (inTray) {
      target = "tray";
    } else {
      want = { x: Math.round(left), y: Math.min(grid.rows, Math.round(top)), rotated: drag.rotated };
      target = snapSlot(drag.bin.binSize, want, grid, others(drag.bin.id));
    }
    setDrag({ ...drag, x: e.clientX, y: e.clientY, target, want });
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    setDrag(null);
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > TAP_SLOP;
    if (!moved) {
      // A tap on a placed 2×1 turns it; anything else is left alone.
      if (drag.bin.binSize === "2x1" && drag.bin.slot) onPlace(drag.bin, { ...drag.bin.slot, rotated: !drag.bin.slot.rotated });
      return;
    }
    if (drag.target === "tray") {
      if (drag.bin.slot) onPlace(drag.bin, null);
    } else if (drag.target) {
      const s = drag.bin.slot;
      if (!s || s.x !== drag.target.x || s.y !== drag.target.y || s.rotated !== drag.target.rotated) onPlace(drag.bin, drag.target);
    } else {
      onProblem("No room there");
    }
  };

  const cancel = () => setDrag(null);

  const binClass = (size: BinSize | null) =>
    `flex items-center justify-center overflow-hidden rounded-md px-1 text-center text-[11px] font-semibold leading-tight shadow-sm [overflow-wrap:anywhere] ${binColors[size ?? "other"]}`;

  const handlers = (bin: Bin) =>
    arranging
      ? { onPointerDown: start(bin), onPointerMove: move, onPointerUp: end, onPointerCancel: cancel }
      : {};

  const dragFp = drag ? footprint(drag.bin.binSize, drag.rotated, grid) : null;

  return (
    <div className={`flex flex-col gap-3 ${arranging ? "touch-none select-none" : ""}`} style={arranging ? { WebkitTouchCallout: "none" } : undefined}>
      <div
        ref={gridRef}
        className="relative w-full rounded-2xl border border-border bg-surface"
        style={{ aspectRatio: `${grid.cols} / ${totalRows}` }}
        role="group"
        aria-label={`Grid of ${box.name}`}
      >
        {/* Empty cells, so the box reads as a box. */}
        {Array.from({ length: grid.rows * grid.cols }, (_, i) => {
          const x = i % grid.cols;
          const y = Math.floor(i / grid.cols);
          return (
            <div
              key={i}
              className="absolute rounded-sm border border-border/60 bg-surface-2/40"
              style={{ left: `calc(${x * cw}% + 2px)`, top: `calc(${y * ch}% + 2px)`, width: `calc(${cw}% - 4px)`, height: `calc(${ch}% - 4px)` }}
            />
          );
        })}
        <div
          className="absolute rounded-sm border border-border/60 bg-surface-2/40"
          style={{ left: 2, top: `calc(${grid.rows * ch}% + 2px)`, width: "calc(100% - 4px)", height: `calc(${STRIP_HEIGHT * ch}% - 4px)` }}
        />

        {/* Where the dragged bin will land (or won't). */}
        {drag && drag.target && drag.target !== "tray" && (
          <div className="absolute z-10 rounded-md border-2 border-ok bg-ok/25" style={rect(drag.target, drag.bin.binSize)} />
        )}
        {drag && drag.target === null && drag.want && (
          <div className="absolute z-10 rounded-md border-2 border-danger bg-danger/20" style={rect(drag.want, drag.bin.binSize)} />
        )}

        {placed.map((b) => {
          const style = { ...rect(b.slot, b.binSize), padding: 2 };
          const lifted = drag?.bin.id === b.id;
          return (
            <div key={b.id} className="absolute" style={style}>
              {arranging ? (
                <div
                  {...handlers(b)}
                  className={`h-full w-full cursor-grab ${binClass(b.binSize)} ${lifted ? "opacity-30" : ""}`}
                  role="button"
                  aria-label={`${b.name}, ${binSizeLabels[b.binSize ?? "other"]} at column ${b.slot.x + 1} row ${b.slot.y + 1}`}
                >
                  <span className="line-clamp-2">{b.name}</span>
                </div>
              ) : (
                <Link to={`/locations/${b.id}`} className={`h-full w-full ${binClass(b.binSize)} active:opacity-80`}>
                  <span className="line-clamp-2">{b.name}</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {(tray.length > 0 || arranging) && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted">
            {arranging ? "Drag bins into place. Drop one here to take it off the grid. Tap a 2×1 to turn it." : "Not placed on the grid yet:"}
          </p>
          <div
            className={`flex min-h-12 flex-wrap gap-2 rounded-2xl ${arranging ? "border border-dashed border-border p-2" : ""} ${drag?.target === "tray" ? "border-ok bg-ok/10" : ""}`}
          >
            {tray.map((b) => {
              const fp = footprint(b.binSize, false, grid);
              const strip = b.binSize === "front_strip";
              const style = { width: strip ? "100%" : fp.w * cellPx - 4, height: (strip ? STRIP_HEIGHT : fp.h) * cellPx - 4 };
              const lifted = drag?.bin.id === b.id;
              return arranging ? (
                <div key={b.id} {...handlers(b)} style={style} className={`cursor-grab ${binClass(b.binSize)} ${lifted ? "opacity-30" : ""}`} role="button" aria-label={`${b.name}, not placed`}>
                  <span className="line-clamp-2">{b.name}</span>
                </div>
              ) : (
                <Link key={b.id} to={`/locations/${b.id}`} style={style} className={binClass(b.binSize)}>
                  <span className="line-clamp-2">{b.name}</span>
                </Link>
              );
            })}
            {arranging && tray.length === 0 && <span className="self-center px-2 text-[13px] text-muted">Every bin is on the grid.</span>}
          </div>
        </div>
      )}

      {/* The bin under the finger. */}
      {drag && dragFp && (
        <div
          className={`pointer-events-none fixed z-50 ${binClass(drag.bin.binSize)} opacity-90 shadow-lg`}
          style={{
            left: drag.x - drag.grabX,
            top: drag.y - drag.grabY,
            width: (drag.bin.binSize === "front_strip" ? grid.cols : dragFp.w) * cellPx - 4,
            height: (drag.bin.binSize === "front_strip" ? STRIP_HEIGHT : dragFp.h) * cellPx - 4,
          }}
        >
          <span className="line-clamp-2">{drag.bin.name}</span>
        </div>
      )}
    </div>
  );
}
