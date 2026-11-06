import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { binSizeLabels, positionText, type BinOut, type BinSize, type Crumb, type LocationDetail, type LocationSummary } from "../../shared/api";
import { DEFAULT_GRID, STRIP_HEIGHT, footprint, type Grid, type Slot } from "../../shared/grid";
import { api } from "../api";
import { binColors } from "./ui";

// Where something is, told as directions (DEC-038): one line per step of the walk, the biggest
// place first and the place you walk to in bold; the last step is drawn rather than named. A
// gridded box becomes a small map with this bin the only thing in colour, and a rack a thin
// stack of its levels with the right one filled in. The bin's number is for stickers, so it
// comes last and small (DEC-024).

const binColorNames: Record<BinSize, string> = { "1x1": "Red", "2x1": "Yellow", "2x2": "Blue", front_strip: "Grey", other: "" };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th")}`;

/** "Red 1×1 bin": what the bin looks like. */
export function binWhat(size: BinSize | null): string {
  if (!size || size === "other") return "Bin";
  return size === "front_strip" ? "Grey front strip" : `${binColorNames[size]} ${binSizeLabels[size]} bin`;
}

/** "Red 1×1 bin, front row, 2nd from the left": the bin's spot in words. */
export function binWords(size: BinSize | null, slot: Slot | null, grid: Grid): string {
  const what = binWhat(size);
  if (!slot) return `${what}, not on the grid yet`;
  if (size === "front_strip") return what;
  const { w } = footprint(size, slot.rotated, grid);
  const row = slot.y >= grid.rows - 1 ? "front row" : slot.y === 0 ? "back row" : `${ordinal(grid.rows - slot.y)} row from the front`;
  const col = slot.x === 0 ? "far left" : slot.x + w >= grid.cols ? "far right" : `${ordinal(slot.x + 1)} from the left`;
  return `${what}, ${row}, ${col}`;
}

type PlacedBin = LocationSummary & { slot: Slot };

/** The box drawn small: every bin a faint outline, this one in its real colour. */
export function BoxMap({ box, binId, width = 150, className = "" }: { box: LocationDetail; binId: number; width?: number; className?: string }) {
  const grid = box.grid ?? DEFAULT_GRID;
  const totalRows = grid.rows + STRIP_HEIGHT;
  const cw = 100 / grid.cols;
  const ch = 100 / totalRows;
  const bins = box.children.filter((c): c is PlacedBin => c.type === "bin" && c.slot !== null);
  const me = bins.find((b) => b.id === binId);
  return (
    <span
      role="img"
      aria-label={`Map of ${box.name}: ${me ? binWords(me.binSize, me.slot, grid) : "this bin isn't on the grid"}`}
      className={`relative block shrink-0 overflow-hidden rounded-md border border-border bg-surface-2 ${className}`}
      style={{ width, aspectRatio: `${grid.cols} / ${totalRows}` }}
    >
      {bins.map((b) => {
        const fp = footprint(b.binSize, b.slot.rotated, grid);
        const strip = b.slot.y === grid.rows;
        const here = b.id === binId;
        const color = b.binSize && b.binSize !== "other" ? binColors[b.binSize] : "bg-muted";
        return (
          <span
            key={b.id}
            data-here={here || undefined}
            className={`absolute rounded-[3px] border-2 border-surface-2 ${here ? `z-10 ${color}` : "bg-muted/25"}`}
            style={{ left: `${b.slot.x * cw}%`, top: `${b.slot.y * ch}%`, width: `${fp.w * cw}%`, height: `${(strip ? STRIP_HEIGHT : fp.h) * ch}%` }}
          />
        );
      })}
    </span>
  );
}

/** A rack's levels as a thin stack, the right one filled. Taller than this and it gives way to words. */
const RACK_HEIGHT = 44;
export function RackMap({ name, size, slot, label }: { name: string; size: number; slot: number; label: string }) {
  const h = Math.floor((RACK_HEIGHT - (size - 1)) / size);
  if (h < 2) return null;
  return (
    <span role="img" aria-label={`${positionText(label)} of ${size} in ${name}`} className="flex w-[18px] shrink-0 flex-col gap-px">
      {Array.from({ length: size }, (_, i) => (
        <span key={i} className={`block rounded-[2px] ${i === slot ? "bg-warn" : "bg-border"}`} style={{ height: h }} />
      ))}
    </span>
  );
}

/** Can a rack this size be drawn, or does it read as "level 7 of 25"? */
export const rackDrawable = (size: number) => Math.floor((RACK_HEIGHT - (size - 1)) / size) >= 2;

/**
 * The directions to a place: its path as lines, the last place in bold, and the bin drawn on
 * its box. `path` is the place's own path (the place is its last step).
 */
export function WhereBlock({ path: full, out, showName = true, className = "" }: { path: Crumb[]; out?: BinOut | null; /** The bin's number under the map (off where the page's heading is that number). */ showName?: boolean; className?: string }) {
  const { data: sites } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations"), staleTime: 60_000 });
  const me = full.at(-1);
  const isBin = me?.type === "bin";
  const boxCrumb = isBin ? full.at(-2) : undefined;
  const { data: box } = useQuery({
    queryKey: ["location", boxCrumb?.id],
    queryFn: () => api<LocationDetail>(`/locations/${boxCrumb!.id}`),
    enabled: boxCrumb !== undefined,
    staleTime: 30_000,
  });
  if (!me) return null;

  // With one site its name is left off (it's the same everywhere, as in PlacePath).
  const start = sites?.length === 1 && full.length > 1 && full[0]!.id === sites[0]!.id ? 1 : 0;
  const steps = full.slice(start, isBin ? -1 : undefined);
  const lines = steps.length > 0 ? steps : full.slice(0, -1);
  const bin = box?.children.find((c) => c.id === me.id);
  const grid = box?.grid ?? null;
  const words = isBin ? (grid ? binWords(bin?.binSize ?? null, bin?.slot ?? null, grid) : binWhat(bin?.binSize ?? null)) : null;

  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      {lines.map((c, i) => {
        const next = full[full.indexOf(c) + 1];
        const slot = next?.position && c.rackSize ? (next.rackSlot ?? null) : null;
        const last = i === lines.length - 1;
        const position = next?.position
          ? ` · ${positionText(next.position)}${c.rackSize && !rackDrawable(c.rackSize) ? ` of ${c.rackSize}` : ""}`
          : "";
        return (
          <span key={c.id} className="flex items-center gap-2">
            <Link to={`/locations/${c.id}`} className={`min-w-0 truncate ${last ? "text-base font-semibold" : "text-[13px] text-muted"}`}>
              {c.name}
              {position}
            </Link>
            {slot !== null && c.rackSize && next?.position && <RackMap name={c.name} size={c.rackSize} slot={slot} label={next.position} />}
          </span>
        );
      })}
      {isBin && (
        <div className="mt-1.5 flex items-start gap-3">
          {box && grid && bin?.slot && (
            <Link to={`/locations/${box.id}?bin=${me.id}`} aria-label={`Open ${box.name} with ${me.name} marked`} className="shrink-0">
              <BoxMap box={box} binId={me.id} />
            </Link>
          )}
          <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            {words && <span className="text-sm">{words}</span>}
            {showName && <span className="font-mono text-[13px] text-muted">{me.name}</span>}
            {out && (
              <span className="flex items-center gap-1 text-[13px] text-info">
                <LogOut size={14} className="shrink-0" /> The bin is out: {out.to?.name ?? out.note}
              </span>
            )}
          </span>
        </div>
      )}
      {!isBin && out && (
        <span className="flex items-center gap-1 text-[13px] text-info">
          <LogOut size={14} className="shrink-0" /> Out: {out.to?.name ?? out.note}
        </span>
      )}
    </div>
  );
}
