import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ImageOff } from "lucide-react";
import { binSizeLabels, type BinSize, type Crumb } from "../../shared/api";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg font-semibold",
  secondary: "bg-surface-2 border border-border",
  ghost: "text-accent",
  danger: "bg-danger/15 text-danger border border-danger/40",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent ${variants[variant]} ${className}`}
    />
  );
}

const binColors: Record<BinSize, string> = {
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
          <Link to={`/locations/${c.id}`} className="hover:text-text">{c.name}</Link>
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
export const pathText = (path: Crumb[]) => path.map((c) => c.name).join(" › ");
