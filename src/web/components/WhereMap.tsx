import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { LocationIcon } from "./LocationList";
import { binSizeLabels, positionText, type BinOut, type BinSize, type Crumb, type LocationDetail, type LocationSummary } from "../../shared/api";
import { DEFAULT_GRID, STRIP_HEIGHT, footprint, type Grid, type Slot } from "../../shared/grid";
import { api } from "../api";
import { binColors } from "./ui";

// Where something is, told as a route (DEC-038): one line down the left with a numbered stop for
// each place of the walk, biggest first, and the last stop a dot in the bin's colour. Each stop
// shows what its kind of place has to show: a rack its level as words and a thin stack, a gridded
// box a small map with this bin the only thing in colour, a bin its spot in words. The place you
// walk to (the box) is bold. The bin's number is for stickers, so it comes last and small (DEC-024).

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
 * The route to a place: a stop per step of its path, the last one the place itself. `path` is the
 * place's own path (the place is its last step).
 */
export function WhereBlock({ path: full, out, showName = true, compact = false, className = "" }: { path: Crumb[]; out?: BinOut | null; /** The bin's number under the words (off where the page's heading is that number). */ showName?: boolean; /** A smaller map, for a page whose subject is the bin itself. */ compact?: boolean; className?: string }) {
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

  const bin = box?.children.find((c) => c.id === me.id);
  const grid = box?.grid ?? null;
  const words = isBin ? (grid ? binWords(bin?.binSize ?? null, bin?.slot ?? null, grid) : binWhat(bin?.binSize ?? null)) : null;
  const dotColor = isBin ? (bin?.binSize && bin.binSize !== "other" ? binColors[bin.binSize] : "bg-muted") : "bg-text";
  // The place you walk to: the bin's box, or the place itself when it isn't a bin.
  const walkTo = isBin ? full.length - 2 : full.length - 1;
  const stops = full.length + (out ? 1 : 0);

  return (
    <ol className={`flex min-w-0 flex-col ${className}`} aria-label="How to get there">
      {full.map((c, i) => {
        const next = full[i + 1];
        const last = i === full.length - 1;
        const level = next?.position && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            {positionText(next.position)}
            {c.rackSize ? ` of ${c.rackSize}` : ""}
            {c.rackSize && next.rackSlot !== null && next.rackSlot !== undefined && rackDrawable(c.rackSize) && (
              <RackMap name={c.name} size={c.rackSize} slot={next.rackSlot} label={next.position} />
            )}
          </span>
        );
        return (
          <li key={c.id} className="relative min-w-0 pb-3 pl-9 last:pb-0" data-stop={last ? "here" : i + 1}>
            {i < stops - 1 && <span aria-hidden className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-border" />}
            {last ? (
              <span aria-hidden className={`absolute left-[5px] top-1.5 h-3.5 w-3.5 rounded-full ${dotColor}`} />
            ) : (
              <span aria-hidden className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-surface text-[11px] font-semibold tabular-nums">
                {i + 1}
              </span>
            )}
            {last && isBin ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                {showName ? <Link to={`/locations/${me.id}`} className="text-sm">{words}</Link> : <span className="text-sm">{words}</span>}
                {showName && <span className="font-mono text-[13px] text-muted">{me.name}</span>}
              </span>
            ) : (
              <span className="flex min-w-0 flex-col gap-1">
                <Link to={`/locations/${c.id}`} className={`flex min-w-0 items-center gap-1.5 ${i === walkTo ? "text-base font-semibold" : "text-[15px]"}`}>
                  {c.type && <LocationIcon type={c.type} />}
                  <span className="truncate">{c.name}</span>
                </Link>
                {level}
                {isBin && i === walkTo && box && grid && bin?.slot && (
                  <Link to={`/locations/${box.id}?bin=${me.id}`} aria-label={`Open ${box.name} with ${me.name} marked`} className="self-start">
                    <BoxMap box={box} binId={me.id} width={compact ? 108 : 150} />
                  </Link>
                )}
                {isBin && i === walkTo && box && grid && !bin?.slot && <span className="text-[13px] text-muted">The bin isn't on the grid yet</span>}
              </span>
            )}
          </li>
        );
      })}
      {out && (
        <li className="relative min-w-0 pl-9" data-stop="out">
          <span aria-hidden className="absolute left-[5px] top-1.5 h-3.5 w-3.5 rounded-full bg-info" />
          <span className="flex items-center gap-1.5 text-sm text-info">
            <LogOut size={16} className="shrink-0" />
            {isBin ? "The bin is out: " : "Out: "}
            {out.to ? <Link to={`/locations/${out.to.id}`} className="underline">{out.to.name}</Link> : out.note}
          </span>
        </li>
      )}
    </ol>
  );
}
