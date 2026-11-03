import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import type { BackupInfo, EventView } from "../../shared/api";
import { api } from "../api";
import { EventList } from "../components/EventList";
import { useToast } from "../components/Toast";

export function ActivityPage() {
  const { data } = useQuery({ queryKey: ["events", "all"], queryFn: () => api<EventView[]>("/events?limit=200") });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Activity</h1>
      <BackupStatus />
      {data ? <EventList events={data} /> : <p className="text-muted">Loading…</p>}
    </div>
  );
}

function ago(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return "less than an hour ago";
  if (h < 48) return `${Math.floor(h)} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function BackupStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["backup"], queryFn: () => api<BackupInfo>("/backup") });
  const run = useMutation({
    mutationFn: () => api<BackupInfo>("/backup", { method: "POST" }),
    onSuccess: (d) => {
      qc.setQueryData(["backup"], d);
      toast.show({ message: "Backed up" });
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: ["backup"] });
      toast.show({ message: e.message, tone: "error" });
    },
  });
  if (!data) return null;

  const last = data.last;
  const stale = !last || !last.ok || Date.now() - new Date(last.at).getTime() > 36 * 3600_000;
  const text = !data.enabled
    ? "Backups are off"
    : !last
      ? "No backup yet"
      : last.ok
        ? `Backed up ${ago(last.at)} · ${last.items} items, ${last.photos} photos`
        : `Last backup failed: ${last.error}`;

  return (
    <div className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 text-sm ${stale ? "border-warn/40 bg-warn/10 text-warn" : "border-border bg-surface text-muted"}`}>
      <HardDrive size={18} className="shrink-0" />
      <span className="flex-1">{text}</span>
      {data.enabled && (
        <button onClick={() => run.mutate()} disabled={run.isPending} className="min-h-11 shrink-0 px-1 font-semibold text-accent disabled:opacity-50">
          {run.isPending ? "Backing up…" : "Back up now"}
        </button>
      )}
    </div>
  );
}
