import { useQuery } from "@tanstack/react-query";
import type { EventView } from "../../shared/api";
import { api } from "../api";
import { EventList } from "../components/EventList";

export function ActivityPage() {
  const { data } = useQuery({ queryKey: ["events", "all"], queryFn: () => api<EventView[]>("/events?limit=200") });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Activity</h1>
      {data ? <EventList events={data} /> : <p className="text-muted">Loading…</p>}
    </div>
  );
}
