import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Camera, ChevronRight, Plus, Search } from "lucide-react";
import type { LocationSummary } from "../../shared/api";
import { api } from "../api";
import { LocationList } from "../components/LocationList";

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["locations", null],
    queryFn: () => api<LocationSummary[]>("/locations"),
  });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<{ needsDetails: number }>("/stats") });

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
