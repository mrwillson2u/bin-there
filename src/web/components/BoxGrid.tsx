import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCw } from "lucide-react";
import { binSizeLabels, type BinSize, type LocationDetail, type LocationSummary } from "../../shared/api";
import { DEFAULT_GRID, STRIP_HEIGHT, footprint, snapSlot, type Grid, type PlacedBin, type Slot } from "../../shared/grid";
import { itemName } from "./ui";

/** The bin's colour as the tile's outline (DEC-041): the inside stays dark, so the grid reads quietly. */
const binOutline: Record<BinSize, string> = {
  "1x1": "border-bin-1x1",
  "2x1": "border-bin-2x1",
  "2x2": "border-bin-2x2",
  front_strip: "border-bin-front",
  other: "border-border",
};

// The gridded box drawn as it sits on the bench: a grid of cells with the front
// strip along the bottom. Bins show in their real colors in their slots, labelled
// with what's in them. In arrange mode a bin follows the finger (or mouse) and
// snaps into the nearest free slot when let go; dropping it in the tray below takes
// it off the grid. New bins are dragged in from the palette above the grid (DEC-020).

type Bin = LocationSummary;

/** A bin from the palette that doesn't exist yet. */
type NewBin = { id: -1; binSize: BinSize; name: string; slot: null; preview: string[]; itemCount: 0 };

type Drag = {
  bin: Bin | NewBin;
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
const isNew = (b: Bin | NewBin): b is NewBin => b.id === -1;

/** What the palette offers, in the order the physical case comes with them. The 2×1 is offered both ways round. */
const palette: { size: BinSize; rotated: boolean; label: string; short: string }[] = [
  { size: "1x1", rotated: false, label: "1×1", short: "1×1" },
  { size: "2x1", rotated: false, label: "2×1 wide", short: "wide" },
  { size: "2x1", rotated: true, label: "2×1 tall", short: "tall" },
  { size: "2x2", rotated: false, label: "2×2", short: "2×2" },
  { size: "front_strip", rotated: false, label: "Front strip", short: "Front strip" },
];

/** On the grid every tile is a bin, so "Bin 0042" shows as just "0042"; other names as they are. */
export const tileName = (name: string) => /^Bin (\d+)$/.exec(name)?.[1] ?? name;
const EMPTY = "Empty";
/** A bin taken out of the box (DEC-028): grey and striped, so its saved spot reads as "away". */
const OUT_CLASS = "grayscale opacity-70 [background-image:repeating-linear-gradient(135deg,rgba(0,0,0,0.38)_0_5px,transparent_5px_10px)]";
const outWhere = (b: Bin) => (b.out ? (b.out.to?.name ?? b.out.note ?? "") : "");

type TileShape = { shape: "square" | "wide" | "tall"; big: boolean };

/**
 * What a tile shows: for a bin that's out, "Out" and where it went; else, when the box shows
 * photos and the bin has one (DEC-036), the square photo with the part's name in the same small
 * white type on every shape: in a strip over a square tile, beside the photo on a wide one, under
 * it on a tall one (DEC-041);
 * otherwise its contents in words, or a quiet "Empty".
 */
function TileText({ bin, label, photos, tile }: { bin: Bin; label: string; photos?: boolean; tile?: TileShape }) {
  if (!bin.out && photos && bin.thumbUrl && tile && label !== EMPTY) {
    const more = bin.itemCount > 1 ? bin.itemCount - 1 : 0;
    // Name the part whose photo it is (the first with a photo may not be the first A to Z).
    label = `${itemName(bin.thumbName ?? "")}${more > 0 ? ` +${more}` : ""}`;
    const name = "text-left text-[10px] font-medium leading-tight text-white";
    if (tile.shape === "wide") {
      return (
        <span className="pointer-events-none absolute inset-0 flex items-center gap-1.5 overflow-hidden bg-surface">
          <img src={bin.thumbUrl} alt="" draggable={false} className="aspect-square h-full shrink-0 object-cover" />
          <span className={`line-clamp-2 min-w-0 pr-1 ${name}`}>{label}</span>
        </span>
      );
    }
    if (tile.shape === "tall") {
      return (
        <span className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden bg-surface">
          <img src={bin.thumbUrl} alt="" draggable={false} className="aspect-square w-full shrink-0 object-cover" />
          <span className={`line-clamp-3 min-h-0 px-1 pt-1 ${name}`}>{label}</span>
        </span>
      );
    }
    return (
      <span className="pointer-events-none absolute inset-0 overflow-hidden bg-surface">
        <img src={bin.thumbUrl} alt="" draggable={false} className="h-full w-full object-cover" />
        <span className={`absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 ${name}`}>{label}</span>
      </span>
    );
  }
  if (bin.out) {
    return (
      <span className="flex min-w-0 flex-col items-center text-muted">
        <span className="uppercase tracking-wide">Out</span>
        <span className="line-clamp-2 font-normal">{outWhere(bin)}</span>
      </span>
    );
  }
  return <span className={`line-clamp-2 ${label === EMPTY ? "text-muted" : ""}`}>{label}</span>;
}

/** What a bin tile says: its first item (and how many more), or "Empty". The ID is for the sticker, not for people. */
export function binLabel(b: Pick<Bin, "name" | "preview" | "itemCount">): string {
  const first = b.preview[0];
  if (b.itemCount === 0 || first === undefined) return EMPTY;
  // A part saved with just a photo still shows that the bin isn't empty ("Unnamed item").
  const more = b.itemCount - 1;
  return more > 0 ? `${itemName(first)} +${more}` : itemName(first);
}

export function BoxGrid({
  box,
  arranging,
  onPlace,
  onCreate,
  onOpen,
  onProblem,
  stickers = false,
  selectedId = null,
  seenId = null,
}: {
  box: LocationDetail;
  arranging: boolean;
  onPlace: (bin: Bin, slot: Slot | null) => void;
  /** A bin from the palette was dropped on the grid. */
  onCreate: (binSize: BinSize, slot: Slot) => void;
  /** A bin was tapped outside arrange mode. */
  onOpen: (bin: Bin) => void;
  onProblem: (message: string) => void;
  /** Sticker mode (DEC-022): tiles show their name and sticker code instead of their contents. */
  stickers?: boolean;
  /** The bin chosen to get a sticker: solid outline. */
  selectedId?: number | null;
  /** The bin whose sticker the camera (or scanner) is looking at: dashed outline. */
  seenId?: number | null;
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

  const start = (bin: Bin | NewBin, rotated?: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!arranging || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setDrag({
      bin,
      rotated: rotated ?? bin.slot?.rotated ?? false,
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

  // While a drag is on, follow the pointer from the window, not the bin: a mouse can
  // lose pointer capture mid-drag (the phone's touch events stay bound to the bin).
  useEffect(() => {
    if (!drag) return;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey);
    };
  });

  const move = (e: PointerEvent) => {
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

  const end = (e: PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > TAP_SLOP;
    const bin = drag.bin;
    if (isNew(bin)) {
      // A new bin from the palette only exists once it lands on the grid.
      if (!moved) return;
      if (drag.target && drag.target !== "tray") onCreate(bin.binSize, drag.target);
      else onProblem(drag.target === "tray" ? "Drop a new bin on the grid to add it" : "No room there");
      return;
    }
    if (!moved) {
      // A tap on a placed 2×1 turns it; anything else is left alone.
      if (bin.binSize === "2x1" && bin.slot) onPlace(bin, { ...bin.slot, rotated: !bin.slot.rotated });
      return;
    }
    if (drag.target === "tray") {
      if (bin.slot) onPlace(bin, null);
    } else if (drag.target) {
      const s = bin.slot;
      if (!s || s.x !== drag.target.x || s.y !== drag.target.y || s.rotated !== drag.target.rotated) onPlace(bin, drag.target);
    } else {
      onProblem("No room there");
    }
  };

  const cancel = () => setDrag(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") cancel();
  };

  const binClass = (size: BinSize | null, out = false) =>
    `relative flex items-center justify-center overflow-hidden rounded-[6px] border-[3px] bg-surface-2 px-1 text-center text-[11px] font-medium leading-tight text-text [overflow-wrap:anywhere] ${binOutline[size ?? "other"]} ${out ? OUT_CLASS : ""}`;

  // A tile's shape decides how a photo is laid out on it (DEC-036). Big = room for a name strip.
  const photos = box.tileView !== "names";
  const shapeOf = (size: BinSize | null, rotated: boolean): TileShape => {
    const fp = footprint(size ?? "1x1", rotated, grid);
    const wide = size === "front_strip" || fp.w > fp.h;
    return { shape: wide ? "wide" : fp.h > fp.w ? "tall" : "square", big: fp.w >= 2 || cellPx >= 70 };
  };

  // No native drag-and-drop on the bins: it would steal the pointer from us.
  const handlers = (bin: Bin | NewBin, rotated?: boolean) =>
    arranging ? { onPointerDown: start(bin, rotated), onDragStart: (e: DragEvent) => e.preventDefault(), draggable: false } : {};

  const dragFp = drag ? footprint(drag.bin.binSize, drag.rotated, grid) : null;
  const ring = (id: number) =>
    id === selectedId
      ? `outline outline-[3px] outline-offset-0 ${id === seenId ? "outline-ok" : "outline-text"}`
      : id === seenId
        ? "outline-dashed outline-[3px] outline-offset-0 outline-text"
        : "";
  /** The chosen bin stands out by the others fading; it and the seen one draw above their neighbours. */
  const lift = (id: number) => (id === selectedId || id === seenId ? "z-10" : selectedId !== null ? "opacity-50" : "");
  // Screen readers get the full name ("Bin 0042"), plus the contents when the tile shows them.
  const ariaName = (b: Bin, label: string) =>
    (stickers ? `${b.name}, ${b.code ? `sticker ${b.code}` : "no sticker"}` : label === EMPTY ? `${b.name}, empty` : `${label}, ${b.name}`) +
    (b.out ? `, out${b.out.to ? ` to ${b.out.to.name}` : `: ${b.out.note ?? ""}`}` : "");
  const pxSize = (size: BinSize, rotated: boolean, px = cellPx) => {
    const fp = footprint(size, rotated, grid);
    const strip = size === "front_strip";
    return { width: strip ? "100%" : fp.w * px - 6, height: (strip ? STRIP_HEIGHT : fp.h) * px - 6 };
  };
  // The palette shows the shapes a bit smaller than life so it doesn't push the grid down the screen.
  const palettePx = cellPx * 0.6;

  return (
    <div className={`flex flex-col gap-3 ${arranging ? "touch-none select-none [-webkit-user-drag:none]" : ""}`} style={arranging ? { WebkitTouchCallout: "none" } : undefined}>
      {arranging && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted">Drag a new bin onto the grid:</p>
          <div className="flex flex-wrap items-end gap-2" role="group" aria-label="New bins">
            {palette.map((p) => {
              const fresh: NewBin = { id: -1, binSize: p.size, name: p.label, slot: null, preview: [], itemCount: 0 };
              return (
                <div key={p.label} {...handlers(fresh, p.rotated)} style={pxSize(p.size, p.rotated, palettePx)} className={`cursor-grab ${binClass(p.size)} !text-[10px]`} role="button" aria-label={`New ${p.label} bin`}>
                  <span className="whitespace-nowrap">{p.short}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        className="relative w-full rounded-lg border border-border bg-surface"
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
              className="absolute rounded-[6px] border border-border/50"
              style={{ left: `calc(${x * cw}% + 3px)`, top: `calc(${y * ch}% + 3px)`, width: `calc(${cw}% - 6px)`, height: `calc(${ch}% - 6px)` }}
            />
          );
        })}
        <div
          className="absolute rounded-[6px] border border-border/50"
          style={{ left: 3, top: `calc(${grid.rows * ch}% + 3px)`, width: "calc(100% - 6px)", height: `calc(${STRIP_HEIGHT * ch}% - 6px)` }}
        />

        {/* Where the dragged bin will land (or won't). */}
        {drag && drag.target && drag.target !== "tray" && (
          <div className="absolute z-10 rounded-md border-2 border-ok bg-ok/25" style={rect(drag.target, drag.bin.binSize)} />
        )}
        {drag && drag.target === null && drag.want && (
          <div className="absolute z-10 rounded-md border-2 border-danger bg-danger/20" style={rect(drag.want, drag.bin.binSize)} />
        )}

        {placed.map((b) => {
          const style = { ...rect(b.slot, b.binSize), padding: 3 };
          const lifted = drag?.bin.id === b.id;
          const label = binLabel(b);
          return (
            <div key={b.id} className={`absolute ${lift(b.id)}`} style={style} data-selected={b.id === selectedId || undefined} data-seen={b.id === seenId || undefined}>
              {arranging ? (
                <div
                  {...handlers(b)}
                  className={`relative h-full w-full cursor-grab ${binClass(b.binSize, !!b.out)} ${lifted ? "opacity-30" : ""}`}
                  role="button"
                  aria-label={`${ariaName(b, label)}, ${binSizeLabels[b.binSize ?? "other"]} at column ${b.slot.x + 1} row ${b.slot.y + 1}${b.binSize === "2x1" ? ", tap to turn" : ""}`}
                >
                  <TileText bin={b} label={label} photos={photos} tile={shapeOf(b.binSize, b.slot.rotated)} />
                  {b.binSize === "2x1" && <RotateCw size={12} className="absolute right-0.5 top-0.5 z-10 opacity-60" aria-hidden />}
                </div>
              ) : (
                <button type="button" onClick={() => onOpen(b)} className={`h-full w-full ${binClass(b.binSize, !!b.out)} ${ring(b.id)} active:opacity-80`} aria-label={ariaName(b, label)}>
                  {stickers ? <StickerLabel bin={b} /> : <TileText bin={b} label={label} photos={photos} tile={shapeOf(b.binSize, b.slot.rotated)} />}
                </button>
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
              const style = pxSize(b.binSize ?? "1x1", false);
              const lifted = drag?.bin.id === b.id;
              const label = binLabel(b);
              return arranging ? (
                <div key={b.id} {...handlers(b)} style={style} className={`cursor-grab ${binClass(b.binSize, !!b.out)} ${lifted ? "opacity-30" : ""}`} role="button" aria-label={`${ariaName(b, label)}, not placed`}>
                  <TileText bin={b} label={label} photos={photos} tile={shapeOf(b.binSize, false)} />
                </div>
              ) : (
                <div key={b.id} className={`relative ${lift(b.id)}`} data-selected={b.id === selectedId || undefined} data-seen={b.id === seenId || undefined}>
                  <button type="button" onClick={() => onOpen(b)} style={style} className={`${binClass(b.binSize, !!b.out)} ${ring(b.id)}`} aria-label={ariaName(b, label)}>
                    {stickers ? <StickerLabel bin={b} /> : <TileText bin={b} label={label} photos={photos} tile={shapeOf(b.binSize, false)} />}
                  </button>
                </div>
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
            width: (drag.bin.binSize === "front_strip" ? grid.cols : dragFp.w) * cellPx - 6,
            height: (drag.bin.binSize === "front_strip" ? STRIP_HEIGHT : dragFp.h) * cellPx - 6,
          }}
        >
          <span className="line-clamp-2">{binLabel(drag.bin)}</span>
        </div>
      )}
    </div>
  );
}

/** The last few characters of a sticker code: the part that differs from bin to bin. */
export const codeTail = (code: string) => (code.length > 5 ? `…${code.slice(-4)}` : code);

function StickerLabel({ bin }: { bin: Bin }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="line-clamp-1">{tileName(bin.name)}</span>
      <span className={`font-mono text-[11px] ${bin.code ? "" : "opacity-60"}`}>{bin.code ? codeTail(bin.code) : "no sticker"}</span>
    </span>
  );
}
