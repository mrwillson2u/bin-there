import { Link } from "react-router-dom";
import { Warehouse, Box, ChevronRight, Grid3x3, Layers, Package, Square } from "lucide-react";
import { locationTypeLabels, type LocationSummary, type LocationType } from "../../shared/api";
import { BinChip, itemName } from "./ui";

const icons: Record<LocationType, typeof Box> = {
  site: Warehouse,
  rack: Layers,
  gridded_box: Grid3x3,
  tote: Package,
  tub: Package,
  bin: Square,
  shelf: Layers,
  project: Box,
  other: Box,
};

export function LocationIcon({ type }: { type: LocationType }) {
  const Icon = icons[type];
  return <Icon size={20} className="shrink-0 text-muted" />;
}

/** What's in a location, in a few words: "M3 nuts, M3 washers +2", "4 inside", "Empty" (DEC-024). */
export function contents(l: Pick<LocationSummary, "childCount" | "itemCount" | "preview">): string {
  const parts: string[] = [];
  if (l.childCount > 0) parts.push(`${l.childCount} inside`);
  if (l.itemCount > 0) {
    const more = l.itemCount - l.preview.length;
    parts.push(l.preview.length > 0 ? `${l.preview.map(itemName).join(", ")}${more > 0 ? ` +${more}` : ""}` : `${l.itemCount} parts`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Empty";
}

export function LocationList({ locations, empty }: { locations: LocationSummary[]; empty: string }) {
  if (locations.length === 0) return <p className="px-1 py-6 text-center text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {locations.map((l) => {
        const Icon = icons[l.type];
        return (
          <li key={l.id}>
            <Link to={`/locations/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-surface-2">
              {l.type === "bin" && l.binSize ? <BinChip size={l.binSize} /> : <Icon size={20} className="text-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                <span className="block truncate text-[13px] text-muted">{[locationTypeLabels[l.type], contents(l)].filter(Boolean).join(" · ")}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
