import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, LogOut, SquareDashed, Undo2 } from "lucide-react";
import type { LocationDetail, LocationSummary, ProjectSummary } from "../../shared/api";
import { api } from "../api";
import { timeAgo } from "./EventList";
import { useToast } from "./Toast";
import { Button, inputClass } from "./ui";

// Taking a bin out of its box for a while (DEC-028): to a project kit, or with a note. The bin
// keeps its spot on the grid (shown grey and striped) until it's put back.

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["location", "locations", "items", "projects", "events", "pins"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

/** Take a bin out of its box, to a kit or with a note. Used by the form below and by a kit's bin scan. */
export function useTakeOutBin(binId: number, onDone: () => void) {
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { toLocationId?: number; note?: string }) => api<LocationDetail>(`/locations/${binId}/take-out`, { method: "POST", body }),
    onSuccess: (b) => {
      toast.show({ message: `${b.name} taken out${b.out?.to ? ` to ${b.out.to.name}` : ""}. Its spot is saved` });
      refresh();
      onDone();
    },
  });
}

/** Pick the project kit the bin is going to (one tap), or write where it is. */
export function TakeOutForm({ bin, onDone, onCancel }: { bin: { id: number; name: string }; onDone: () => void; onCancel: () => void }) {
  const { data: kits } = useQuery({ queryKey: ["projects"], queryFn: () => api<ProjectSummary[]>("/projects") });
  const [note, setNote] = useState("");
  const takeOut = useTakeOutBin(bin.id, onDone);
  const hasKits = !!kits && kits.length > 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/50 p-3" role="group" aria-label={`Take ${bin.name} out`}>
      <div>
        <p className="font-semibold">Where is {bin.name} going?</p>
        <p className="text-[13px] text-muted">Its spot in the box stays saved until you put it back.</p>
      </div>
      {hasKits && (
        <div className="flex flex-wrap gap-2">
          {kits.map((k) => (
            <Button key={k.id} onClick={() => takeOut.mutate({ toLocationId: k.id })} disabled={takeOut.isPending}>
              <FolderKanban size={18} /> {k.name}
            </Button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) takeOut.mutate({ note: note.trim() });
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={hasKits ? "Or a note, e.g. on the bench" : "A note, e.g. on the bench"}
          aria-label="Where it is"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <Button type="submit" disabled={!note.trim() || takeOut.isPending}>Take out</Button>
      </form>
      {takeOut.error && <p className="text-sm text-danger" role="alert">{(takeOut.error as Error).message}</p>}
      <div className="flex flex-wrap items-center gap-x-4">
        <Button variant="ghost" className="px-1" onClick={onCancel}>Cancel</Button>
        {!hasKits && (
          <Link to="/locations/new?type=project" className="text-sm text-accent">
            Start a project kit
          </Link>
        )}
      </div>
    </div>
  );
}

/** Put a bin that's out back in its box, in its saved spot. */
export function usePutBackBin() {
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (binId: number) => api<LocationDetail>(`/locations/${binId}/put-back`, { method: "POST" }),
    onSuccess: (b) => {
      toast.show({ message: `${b.name} is back in ${b.path.at(-2)?.name ?? "its box"}` });
      refresh();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });
}

/**
 * Give up an out bin's saved spot (DEC-028), say to keep it out for good and put a new bin
 * there. It stays out; when it comes back it waits under "Not placed".
 */
function useFreeSpot() {
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (binId: number) => api<LocationDetail>(`/locations/${binId}/slot`, { method: "PUT", body: null }),
    onSuccess: (b) => {
      toast.show({ message: `${b.name}'s spot is free. It's still out` });
      refresh();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });
}

/** A bin that's out: where it went and since when, with one tap to put it back in its spot. */
export function OutBanner({ bin, boxName }: { bin: LocationSummary; boxName: string }) {
  const putBack = usePutBackBin();
  const freeSpot = useFreeSpot();
  if (!bin.out) return null;
  const { to, note, at } = bin.out;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-info/40 bg-info/10 p-3" role="group" aria-label={`${bin.name} is out`}>
      <p className="flex items-center gap-2 font-semibold text-info">
        <LogOut size={18} className="shrink-0" /> Out of {boxName}
      </p>
      <p className="text-sm">
        {to ? (
          <>
            In{" "}
            <Link to={`/locations/${to.id}`} className="font-semibold text-accent">
              {to.name}
            </Link>
            {note && ` · ${note}`}
          </>
        ) : (
          note
        )}
        <span className="text-muted"> · {timeAgo(at)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="primary" onClick={() => putBack.mutate(bin.id)} disabled={putBack.isPending}>
          <Undo2 size={18} /> Put it back in {boxName}
        </Button>
        {bin.slot && (
          <Button
            variant="ghost"
            className="px-1"
            disabled={freeSpot.isPending}
            onClick={() => {
              if (window.confirm(`Free ${bin.name}'s spot in ${boxName}? It stays out, and another bin can go there. When it's back it waits under "Not placed".`)) freeSpot.mutate(bin.id);
            }}
          >
            <SquareDashed size={18} /> Free its spot
          </Button>
        )}
      </div>
      {!bin.slot && <p className="text-[13px] text-muted">Its spot was given up; when it's back it waits under "Not placed".</p>}
    </div>
  );
}

/** "out: Weather station" or "out: on the bench", for a part's place line. */
export const outText = (out: { to: { name: string } | null; note: string | null }) => `bin out: ${out.to?.name ?? out.note ?? ""}`;
