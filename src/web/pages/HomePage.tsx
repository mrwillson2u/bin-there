import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Camera, ChevronRight, Pin, Plus, Search } from "lucide-react";
import type { LocationSummary, Pins } from "../../shared/api";
import { api } from "../api";
import { LocationList } from "../components/LocationList";
import { ItemList } from "../components/ItemList";
import { BinChip, pathText } from "../components/ui";

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["locations", null],
    queryFn: () => api<LocationSummary[]>("/locations"),
  });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<{ needsDetails: number }>("/stats") });
  const { data: pins } = useQuery({ queryKey: ["pins"], queryFn: () => api<Pins>("/pins") });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Garage</h1>

      <Link to="/search" className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 text-muted">
        <Search size={18} /> Search parts…
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Link to="/capture" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2">
          <Camera size={18} /> Add item
        </Link>
        <Link to="/locations/new" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2">
          <Plus size={18} /> Add location
        </Link>
      </div>

      {stats && stats.needsDetails > 0 && (
        <Link to="/search?needs=1" className="flex min-h-12 items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 text-warn">
          <span className="flex-1">
            {stats.needsDetails} item{stats.needsDetails === 1 ? "" : "s"} need{stats.needsDetails === 1 ? "s" : ""} details
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      {pins && (pins.items.length > 0 || pins.locations.length > 0) && <Pinned pins={pins} />}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Locations</h2>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <LocationList locations={data ?? []} empty="No locations yet. Add a rack, box or tote to start." />
        )}
      </section>
    </div>
  );
}

/** What you're working with right now, one tap away (F11). */
function Pinned({ pins }: { pins: Pins }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
        <Pin size={14} /> Pinned
      </h2>
      {pins.locations.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {pins.locations.map((l) => (
            <li key={l.id}>
              <Link to={`/locations/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
                {l.binSize && <BinChip size={l.binSize} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.name}</span>
                  {l.path.length > 1 && <span className="block truncate text-[13px] text-muted">{pathText(l.path.slice(0, -1))}</span>}
                </span>
                <ChevronRight size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pins.items.length > 0 && <ItemList items={pins.items} empty="" />}
    </section>
  );
}
