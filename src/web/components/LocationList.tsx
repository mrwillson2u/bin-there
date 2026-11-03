import { Link } from "react-router-dom";
import { Archive, Box, ChevronRight, Grid3x3, Layers, Package, Square } from "lucide-react";
import { locationTypeLabels, type LocationSummary, type LocationType } from "../../shared/api";
import { BinChip } from "./ui";

const icons: Record<LocationType, typeof Box> = {
  rack: Layers,
  gridded_box: Grid3x3,
  tote: Package,
  tub: Package,
  bin: Square,
  shelf: Layers,
  put_back: Archive,
  project: Box,
  other: Box,
};

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
              <span className="flex-1">
                <span className="block">{l.name}</span>
                <span className="block text-[13px] text-muted">
                  {locationTypeLabels[l.type]}
                  {l.childCount > 0 && ` · ${l.childCount} inside`}
                  {!l.code && l.type !== "put_back" && " · no sticker"}
                </span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
