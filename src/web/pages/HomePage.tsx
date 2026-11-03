import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { LocationSummary } from "../../shared/api";
import { api } from "../api";
import { LocationList } from "../components/LocationList";

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["locations", null],
    queryFn: () => api<LocationSummary[]>("/locations"),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Garage</h1>
        <Link to="/locations/new" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-accent">
          <Plus size={20} /> Location
        </Link>
      </div>
      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <LocationList locations={data ?? []} empty="No locations yet. Add a rack, box or tote to start." />
      )}
    </div>
  );
}
