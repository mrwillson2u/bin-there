import { Link } from "react-router-dom";
import { levelLabels, type EventView } from "../../shared/api";
import { useToast } from "./Toast";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

function describe(e: EventView): string {
  const at = e.location ? ` in ${e.location}` : "";
  switch (e.type) {
    case "create":
      return e.itemId ? `Added to the catalog${at}${e.delta ? ` (${e.delta})` : ""}` : "Location created";
    case "add":
      return e.delta ? `+${e.delta}${at}` : `Added${at}`;
    case "use":
      return `Used ${Math.abs(e.delta ?? 0)}${e.location ? ` from ${e.location}` : ""}`;
    case "adjust":
      return `Set to ${e.levelAfter ? levelLabels[e.levelAfter] : "?"}${at}`;
    case "recount":
      return `Recounted${at}${e.delta ? ` (${e.delta > 0 ? "+" : ""}${e.delta})` : ""}`;
    case "move":
      return `Moved${e.delta ? ` ${e.delta}` : ""} ${e.from ? `from ${e.from} ` : ""}to ${e.to ?? "top level"}`;
    case "check_out":
      // No item: a whole bin taken out of its box (DEC-028).
      if (!e.itemId) return `${e.location ?? "A bin"} taken out${e.to ? ` to ${e.to}` : ""}`;
      return `Checked out${e.to ? ` to ${e.to}` : ""}`;
    case "check_in":
      if (!e.itemId) return `${e.location ?? "A bin"} put back`;
      return `Checked back in${e.to ? ` to ${e.to}` : ""}`;
    case "assign_code":
      return "Sticker assigned";
    case "retire":
      return `Stickered one removed${at}`;
    case "archive":
      return e.itemId ? "Deleted" : "Location deleted";
    default:
      return e.type.replace("_", " ");
  }
}

export function timeAgo(sqliteDate: string, now = Date.now()): string {
  const t = new Date(sqliteDate.replace(" ", "T") + "Z").getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export function EventList({ events, showItem = true }: { events: EventView[]; showItem?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  if (events.length === 0) return <p className="px-1 py-6 text-center text-muted">Nothing yet.</p>;
  const undo = (id: number) =>
    api(`/events/${id}/undo`, { method: "POST" })
      .then(() => {
        qc.invalidateQueries();
        toast.show({ message: "Undone" });
      })
      .catch((e: Error) => toast.show({ message: e.message, tone: "error" }));

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {events.map((e) => (
        <li key={e.id} className={`flex min-h-12 items-center gap-3 px-4 py-2 ${e.undone ? "opacity-50" : ""}`}>
          <span className="min-w-0 flex-1">
            {showItem && e.itemId && (
              <Link to={`/items/${e.itemId}`} className="block truncate font-medium">
                {e.itemName || "Unnamed item"}
              </Link>
            )}
            {showItem && !e.itemId && e.location && <span className="block truncate font-medium">{e.location}</span>}
            <span className={`block text-sm ${e.undone ? "line-through" : ""}`}>{describe(e)}</span>
            <span className="block text-[13px] text-muted">
              {timeAgo(e.at)}
              {e.undone && " · undone"}
            </span>
          </span>
          {e.canUndo && (
            <button onClick={() => undo(e.id)} className="min-h-11 px-2 text-sm font-semibold text-accent">
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
