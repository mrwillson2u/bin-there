import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, GripVertical, Minus, Plus, X } from "lucide-react";
import { comparePlaces, rackLabel, type LocationDetail, type LocationSummary, type ScanResult } from "../../shared/api";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { contents, LocationIcon } from "./LocationList";
import { PickLocation } from "./PickLocation";
import { useToast } from "./Toast";
import { BinChip, Button, Card, inputClass, PositionTag } from "./ui";

// A rack or shelf with numbered positions (DEC-034): set how many it has, then put things in
// them. Positions read 1, 2, 3… unless given a label. In Arrange, drag a box by its handle onto
// another position (onto a taken one, they swap), change the size, and rename positions.

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["location", "locations", "items", "pins"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

/** A rack or shelf without positions yet: offer to number them. */
export function RackSetup({ rack }: { rack: LocationDetail }) {
  const refresh = useRefresh();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(String(Math.max(rack.children.length, 1)));
  const setUp = useMutation({
    mutationFn: (n: number) => api<LocationDetail>(`/locations/${rack.id}/rack-size`, { method: "PUT", body: { size: n } }),
    onSuccess: (r) => {
      toast.show({ message: `${r.name} has ${r.rack?.size} positions` });
      refresh();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-accent">
        Does it have numbered positions? Set them up
      </button>
    );
  }
  const n = Number(size);
  return (
    <Card className="flex flex-col gap-2 p-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isInteger(n) && n >= 1 && n <= 200) setUp.mutate(n);
        }}
      >
        <label className="flex items-center gap-2">
          <span>How many positions?</span>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            aria-label="How many positions"
            className={`${inputClass} w-20 text-center`}
            autoFocus
          />
        </label>
        <Button variant="primary" type="submit" disabled={!(n >= 1 && n <= 200) || setUp.isPending}>
          Set up
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </form>
      <p className="text-[13px] text-muted">They're numbered 1, 2, 3… (you can rename any). What's inside now goes into them in order; drag to fix that.</p>
    </Card>
  );
}

type Drop = number | "none";

export function RackView({ rack }: { rack: LocationDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = useRefresh();
  const [arranging, setArranging] = useState(false);
  const [filling, setFilling] = useState<number | null>(null);
  const { size, labels } = rack.rack!;
  const bySlot = new Map(rack.children.filter((c) => c.rackSlot !== null).map((c) => [c.rackSlot!, c]));
  const unplaced = rack.children.filter((c) => c.rackSlot === null);
  const highest = Math.max(-1, ...bySlot.keys());

  // Move a place into a position (or out of one). The list changes at once and is put back if the server says no.
  const place = useMutation({
    mutationFn: ({ id, slot }: { id: number; slot: number | null }) => api<LocationDetail>(`/locations/${id}/rack-slot`, { method: "PUT", body: { slot } }),
    onMutate: async ({ id, slot }) => {
      await qc.cancelQueries({ queryKey: ["location", rack.id] });
      const before = qc.getQueryData<LocationDetail>(["location", rack.id]);
      if (before) {
        const moving = before.children.find((c) => c.id === id);
        const from = moving?.rackSlot ?? null;
        const at = (s: number | null) => ({ rackSlot: s, position: s === null ? null : rackLabel(labels, s) });
        const children = before.children
          .map((c) => (c.id === id ? { ...c, ...at(slot) } : slot !== null && c.rackSlot === slot ? { ...c, ...at(from) } : c))
          .sort(comparePlaces);
        qc.setQueryData<LocationDetail>(["location", rack.id], { ...before, children });
      }
      return { before };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(["location", rack.id], ctx.before);
      toast.show({ message: e.message, tone: "error" });
    },
    onSettled: refresh,
  });
  const resize = useMutation({
    mutationFn: (n: number) => api<LocationDetail>(`/locations/${rack.id}/rack-size`, { method: "PUT", body: { size: n } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  // Dragging by the handle (no native drag and drop: it would fight the page's scrolling on a phone).
  const [drag, setDrag] = useState<{ id: number; name: string; from: number | null; over: Drop | null; x: number; y: number } | null>(null);
  const lastY = useRef(0);
  useEffect(() => {
    if (!drag) return;
    // Scroll while holding near the top or bottom edge, so a long rack can be crossed.
    const t = setInterval(() => {
      const y = lastY.current;
      if (y < 90) window.scrollBy(0, -14);
      else if (y > window.innerHeight - 140) window.scrollBy(0, 14);
    }, 16);
    return () => clearInterval(t);
  }, [drag !== null]); // only when a drag starts or ends
  const targetAt = (x: number, y: number): Drop | null => {
    const v = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-drop]")?.getAttribute("data-drop");
    return v == null ? null : v === "none" ? "none" : Number(v);
  };
  const handle = (c: LocationSummary) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      lastY.current = e.clientY;
      setDrag({ id: c.id, name: c.name, from: c.rackSlot, over: c.rackSlot ?? "none", x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag) return;
      lastY.current = e.clientY;
      const over = targetAt(e.clientX, e.clientY);
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, over: over ?? d.over });
    },
    onPointerUp: () => {
      const d = drag;
      setDrag(null);
      if (!d || d.over === null) return;
      const slot = d.over === "none" ? null : d.over;
      if (slot !== d.from) place.mutate({ id: d.id, slot });
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      // Arrow keys move it one position (swapping with what's there).
      const from = c.rackSlot;
      const to = e.key === "ArrowUp" ? (from ?? size) - 1 : e.key === "ArrowDown" ? (from === null ? 0 : from + 1) : null;
      if (to === null) return;
      e.preventDefault();
      if (to >= 0 && to < size) place.mutate({ id: c.id, slot: to });
    },
  });

  const rowName = (c: LocationSummary) => (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {c.type === "bin" && c.binSize ? <BinChip size={c.binSize} /> : <LocationIcon type={c.type} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{c.name}</span>
        <span className="block truncate text-[13px] text-muted">{contents(c)}</span>
      </span>
    </span>
  );
  const dropRing = (d: Drop) => (drag && drag.over === d ? "bg-accent/15 outline outline-2 -outline-offset-2 outline-accent" : "");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {arranging ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm">Positions</span>
            <button type="button" onClick={() => resize.mutate(size - 1)} disabled={size - 1 <= highest || size <= 1 || resize.isPending} aria-label="One fewer position" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 disabled:opacity-40">
              <Minus size={18} />
            </button>
            <span className="w-8 text-center font-mono font-semibold tabular-nums" aria-live="polite">{size}</span>
            <button type="button" onClick={() => resize.mutate(size + 1)} disabled={size >= 200 || resize.isPending} aria-label="One more position" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 disabled:opacity-40">
              <Plus size={18} />
            </button>
          </div>
        ) : (
          <p className="flex-1 text-[13px] text-muted">
            {size} position{size === 1 ? "" : "s"}
            {unplaced.length > 0 && ` · ${unplaced.length} not in one`}
          </p>
        )}
        <button type="button" onClick={() => setArranging((a) => !a)} className={`inline-flex min-h-11 items-center gap-1.5 px-1 ${arranging ? "font-semibold text-accent" : "text-accent"}`}>
          <GripVertical size={18} /> {arranging ? "Done" : "Arrange"}
        </button>
      </div>
      {arranging && <p className="text-[13px] text-muted">Drag ⠿ to move a box; drop it on another to swap them. Type over a number to rename that position.</p>}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Positions">
        {Array.from({ length: size }, (_, i) => {
          const c = bySlot.get(i);
          const label = rackLabel(labels, i);
          if (arranging) {
            return (
              <li key={i} data-drop={i} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${dropRing(i)} ${drag && c && drag.id === c.id ? "opacity-40" : ""}`}>
                <LabelInput rack={rack} slot={i} />
                {c ? rowName(c) : <span className="flex-1 text-sm italic text-muted">Empty</span>}
                {c && (
                  <button type="button" {...handle(c)} aria-label={`Move ${c.name}`} className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted active:cursor-grabbing">
                    <GripVertical size={20} />
                  </button>
                )}
              </li>
            );
          }
          return (
            <li key={i}>
              {c ? (
                <Link to={`/locations/${c.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-surface-2">
                  <PositionTag position={label} big />
                  {rowName(c)}
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              ) : (
                <button type="button" onClick={() => setFilling(i)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2" aria-label={`Position ${label} is empty: put something here`}>
                  <PositionTag position={label} big />
                  <span className="flex-1 text-sm italic text-muted">Empty</span>
                  <span className="inline-flex items-center gap-1 text-sm text-accent">
                    <Plus size={16} /> Put something here
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(unplaced.length > 0 || (arranging && drag)) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Not in a position</h3>
          <ul data-drop="none" className={`min-h-12 divide-y divide-border overflow-hidden rounded-2xl border border-dashed border-border ${dropRing("none")}`}>
            {unplaced.map((c) => (
              <li key={c.id} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${drag?.id === c.id ? "opacity-40" : ""}`}>
                {arranging ? (
                  <>
                    {rowName(c)}
                    <button type="button" {...handle(c)} aria-label={`Move ${c.name}`} className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted">
                      <GripVertical size={20} />
                    </button>
                  </>
                ) : (
                  <Link to={`/locations/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    {rowName(c)}
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </Link>
                )}
              </li>
            ))}
            {unplaced.length === 0 && <li className="px-3 py-3 text-sm text-muted">Drop here to take it out of its position</li>}
          </ul>
        </div>
      )}

      {drag && (
        <span className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-fg shadow-lg" style={{ left: drag.x, top: drag.y }}>
          {drag.name}
          {drag.over !== null && ` → ${drag.over === "none" ? "not in a position" : rackLabel(labels, drag.over)}`}
        </span>
      )}

      {filling !== null && <FillSlot rack={rack} slot={filling} unplaced={unplaced} onClose={() => setFilling(null)} place={(id) => place.mutate({ id, slot: filling })} />}
    </div>
  );
}

/** Rename a position by typing over its number; blank keeps the number. Saved when you leave the box. */
function LabelInput({ rack, slot }: { rack: LocationDetail; slot: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const current = rack.rack!.labels[slot] ?? "";
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const save = useMutation({
    mutationFn: (labels: (string | null)[]) => api<LocationDetail>(`/locations/${rack.id}/rack-labels`, { method: "PUT", body: { labels } }),
    onSuccess: (r) => {
      qc.setQueryData(["location", rack.id], r);
      for (const key of ["locations", "items", "pins"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => {
      setValue(current);
      toast.show({ message: e.message, tone: "error" });
    },
  });
  const commit = () => {
    if (value.trim() === current) return;
    const labels = rack.rack!.labels.slice();
    labels[slot] = value.trim() || null;
    save.mutate(labels);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      placeholder={String(slot + 1)}
      maxLength={20}
      aria-label={`Label for position ${slot + 1}`}
      className={`${inputClass} min-h-10 w-16 shrink-0 px-1 text-center font-mono font-semibold placeholder:text-text`}
    />
  );
}

/** What goes in an empty position: something already in the rack, a scanned box, one from elsewhere, or a new one. */
function FillSlot({ rack, slot, unplaced, onClose, place }: { rack: LocationDetail; slot: number; unplaced: LocationSummary[]; onClose: () => void; place: (id: number) => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [elsewhere, setElsewhere] = useState(false);
  const label = rackLabel(rack.rack!.labels, slot);
  const moveHere = useMutation({
    mutationFn: (id: number) => api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: { parentId: rack.id, rackSlot: slot } }),
    onSuccess: (l) => {
      toast.show({ message: `${l.name} is in position ${label}` });
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });
  const take = (l: { id: number; name: string }) => {
    if (l.id === rack.id) return toast.show({ message: `That's ${rack.name} itself`, tone: "error" });
    if (unplaced.some((u) => u.id === l.id)) {
      place(l.id);
      onClose();
    } else moveHere.mutate(l.id);
  };
  // This sheet says what a scan does here: the scanned box goes in this position (DEC-025).
  useScanHandler((code) => {
    if (elsewhere) return false; // the picker below takes it
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "location") take(r.location);
        else toast.show({ message: r.kind === "unit" ? "That's a part's sticker. Scan a box or tote" : "That sticker isn't on anything yet", tone: "error" });
      })
      .catch((e: Error) => toast.show({ message: e.message, tone: "error" }));
    return true;
  });

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={`Position ${label} of ${rack.name}`}
        data-sheet
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[85dvh] max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:rounded-3xl"
      >
        <div className="flex items-center gap-2">
          <PositionTag position={label} big />
          <p className="flex-1 font-semibold">What goes here?</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-muted">
            <X size={20} />
          </button>
        </div>
        {elsewhere ? (
          <PickLocation title="Scan it, or find it in the list" near={rack.path} onPick={take} onCancel={() => setElsewhere(false)} />
        ) : (
          <>
            <p className="text-[13px] text-muted">Tap one, or scan its sticker.</p>
            {unplaced.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {unplaced.map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => take(u)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2">
                      <LocationIcon type={u.type} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{u.name}</span>
                        <span className="block truncate text-[13px] text-muted">In {rack.name}, not in a position</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setElsewhere(true)}>From somewhere else</Button>
              <Link to={`/locations/new?parent=${rack.id}&slot=${slot}&type=gridded_box`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
                <Plus size={18} /> New box here
              </Link>
            </div>
          </>
        )}
      </section>
    </>
  );
}
