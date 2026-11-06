import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ImageOff } from "lucide-react";
import { binSizeLabels, crumbLabel, positionText, type BinSize, type Crumb, type LocationSummary } from "../../shared/api";
import { api } from "../api";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "scan";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg font-semibold",
  secondary: "bg-surface-2 border border-border",
  ghost: "text-accent",
  danger: "bg-danger/15 text-danger border border-danger/40",
  /** Opens the camera to scan (DEC-044): the scan colour, so it reads as part of the scan target. */
  scan: "bg-scan text-white font-semibold",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent ${variants[variant]} ${className}`}
    />
  );
}

export const binColors: Record<BinSize, string> = {
  "1x1": "bg-bin-1x1 text-white",
  "2x1": "bg-bin-2x1 text-black",
  "2x2": "bg-bin-2x2 text-white",
  front_strip: "bg-bin-front text-black",
  other: "bg-surface-2 text-text border border-border",
};

/** Colored like the physical bin, always with the size printed on it. */
export function BinChip({ size }: { size: BinSize }) {
  return (
    <span className={`inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold ${binColors[size]}`}>
      {binSizeLabels[size]}
    </span>
  );
}

export function Breadcrumbs({ path }: { path: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
      {path.slice(0, -1).map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} />}
          <Link to={`/locations/${c.id}`} className="inline-flex items-center hover:text-text">
            {c.position && <PositionTag position={c.position} />}
            {c.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-surface ${className}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 rounded-xl border border-border bg-surface-2 px-3 text-base text-text placeholder:text-muted focus:outline-2 focus:outline-accent";

/** Square photo thumbnail, or a neutral placeholder. */
export function Thumb({ url, size = 48 }: { url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-lg bg-surface-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" style={{ width: size, height: size }}>
      <ImageOff size={size / 2.4} />
    </span>
  );
}

const badgeTones = {
  warn: "bg-warn/15 text-warn",
  ok: "bg-ok/15 text-ok",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  muted: "bg-surface-2 text-muted",
};

export function Badge({ tone = "muted", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>;
}

export const itemName = (name: string) => name || "Unnamed item";
export const pathText = (path: Crumb[]) => path.map(crumbLabel).join(" › ");

/** A place's position in what it's in, like the number marked on a rack slot (DEC-033). */
export function PositionTag({ position, big }: { position: string; big?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-border font-mono font-semibold tabular-nums text-text ${big ? "h-7 min-w-7 px-1.5 text-sm" : "mr-1 h-[1.3em] min-w-[1.3em] px-1 text-[0.85em] leading-none"}`}
      aria-label={positionText(position)}
    >
      {position}
    </span>
  );
}

/**
 * A location path on one line. With only one site, its name is left off (it's the same
 * everywhere). When it still doesn't fit, the outer places shorten first
 * ("Rack… › Grid box 1 › Bin 0001"), so the bin you're after stays readable.
 */
export function PlacePath({ path: full, before, after, className = "" }: { path: Crumb[]; before?: ReactNode; after?: ReactNode; className?: string }) {
  const { data: sites } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations"), staleTime: 60_000 });
  const path = sites?.length === 1 && full.length > 1 && full[0]!.id === sites[0]!.id ? full.slice(1) : full;
  return (
    <span className={`flex min-w-0 overflow-hidden whitespace-nowrap ${className}`} title={pathText(full)}>
      {before && <span className="shrink-0 whitespace-pre">{before}</span>}
      {path.map((c, i) => (
        // The last place never shrinks (a fraction of a pixel short would cost it two letters to the "…");
        // it's only cut if it alone is wider than the line.
        <span key={c.id} className={i === path.length - 1 ? "max-w-full shrink-0 truncate" : "min-w-[3.5ch] shrink truncate"}>
          {i > 0 && "\u00a0›\u00a0"}
          {c.position && <PositionTag position={c.position} />}
          {c.name}
        </span>
      ))}
      {after && <span className="shrink-0 whitespace-pre">{after}</span>}
    </span>
  );
}
