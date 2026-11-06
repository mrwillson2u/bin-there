import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, GripVertical, Minus, Plus, X } from "lucide-react";
import { comparePlaces, rackLabel, type LocationDetail, type LocationSummary, type ScanResult } from "../../shared/api";
import { rackMove, type RackRow } from "../../shared/rack";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { contents, LocationIcon } from "./LocationList";
import { PickLocation } from "./PickLocation";
import { useToast } from "./Toast";
import { BinChip, Button, Card, inputClass, PositionTag } from "./ui";

// A rack or shelf with numbered positions (DEC-034): set how many it has, then put things in
// them. Positions read 1, 2, 3… unless given a label. In Arrange, drag a box by its handle:
// dropped on another box it takes that position and the ones in between move along, and you
// see them slide while you drag (DEC-035). Change the size and rename positions there too.

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
/** Every position row is the same height, so boxes can slide between them. */
const ROW = 64;

export function RackView({ rack }: { rack: LocationDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = useRefresh();
  const [arranging, setArranging] = useState(false);
  const [filling, setFilling] = useState<number | null>(null);
  const { size, labels } = rack.rack!;
  const row: RackRow = Array.from({ length: size }, () => null);
  for (const c of rack.children) if (c.rackSlot !== null && c.rackSlot < size) row[c.rackSlot] = c.id;
  const placed = rack.children.filter((c) => c.rackSlot !== null && c.rackSlot < size);
  const unplaced = rack.children.filter((c) => c.rackSlot === null);
  const highest = Math.max(-1, ...placed.map((c) => c.rackSlot!));

  // Show the move at once (so the boxes slide straight to where they go), then save it;
  // if the server says no, everything slides back.
  const place = useMutation({
    mutationFn: ({ id, slot }: { id: number; slot: number | null; before?: LocationDetail }) =>
      api<LocationDetail>(`/locations/${id}/rack-slot`, { method: "PUT", body: { slot } }),
    onError: (e: Error, vars) => {
      if (vars.before) qc.setQueryData(["location", rack.id], vars.before);
      toast.show({ message: e.message, tone: "error" });
    },
    onSettled: refresh,
  });
  const move = (id: number, slot: number | null) => {
    const next = slot === null ? rackMove(row, id, null) : rackMove(row, id, slot);
    if (!next) return toast.show({ message: `Every position in ${rack.name} is in use. Add one first`, tone: "error" });
    void qc.cancelQueries({ queryKey: ["location", rack.id] });
    const before = qc.getQueryData<LocationDetail>(["location", rack.id]);
    if (before) {
      const children = before.children
        .map((c) => {
          const at = next.indexOf(c.id);
          const s = at >= 0 ? at : c.id === id ? null : c.rackSlot;
          return { ...c, rackSlot: s, position: s === null ? null : rackLabel(labels, s) };
        })
        .sort(comparePlaces);
      qc.setQueryData<LocationDetail>(["location", rack.id], { ...before, children });
    }
    place.mutate({ id, slot, before });
  };
  const resize = useMutation({
    mutationFn: (n: number) => api<LocationDetail>(`/locations/${rack.id}/rack-size`, { method: "PUT", body: { size: n } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  // Dragging by the handle (no native drag and drop: it would fight the page's scrolling on a phone).
  // A box from a position follows the finger; the others slide to where they'd go (DEC-035).
  type DragState = { id: number; name: string; from: number | null; to: Drop | null; top: number; grab: number; x: number; y: number };
  const [drag, setDrag] = useState<DragState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const last = useRef({ x: 0, y: 0 });
  const targetAt = (x: number, y: number, from: number | null): Drop => {
    const none = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-drop="none"]');
    if (none) return "none";
    const r = listRef.current?.getBoundingClientRect();
    // Away from the positions: it goes nowhere, so it would stay where it is.
    if (!r || x < r.left - 48 || x > r.right + 48 || y < r.top - ROW || y > r.bottom + ROW) return from ?? "none";
    return Math.max(0, Math.min(size - 1, Math.floor((y - r.top) / ROW)));
  };
  const track = (x: number, y: number) => {
    last.current = { x, y };
    const r = listRef.current?.getBoundingClientRect();
    setDrag((d) => d && { ...d, x, y, top: r ? y - r.top - d.grab : d.top, to: targetAt(x, y, d.from) });
  };
  useEffect(() => {
    if (!drag) return;
    // Scroll while holding near the top or bottom edge, so a long rack can be crossed.
    const t = setInterval(() => {
      const { x, y } = last.current;
      if (y < 90) window.scrollBy(0, -14);
      else if (y > window.innerHeight - 140) window.scrollBy(0, 14);
      else return;
      track(x, y);
    }, 16);
    return () => clearInterval(t);
  }, [drag !== null]); // only when a drag starts or ends
  const preview: RackRow = (drag && drag.to !== null && rackMove(row, drag.id, drag.to === "none" ? null : drag.to)) || row;
  const noRoom = !!drag && typeof drag.to === "number" && !rackMove(row, drag.id, drag.to);

  const handle = (c: LocationSummary) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const r = listRef.current?.getBoundingClientRect();
      const from = c.rackSlot !== null && c.rackSlot < size ? c.rackSlot : null;
      const grab = r && from !== null ? e.clientY - (r.top + from * ROW) : ROW / 2;
      last.current = { x: e.clientX, y: e.clientY };
      setDrag({ id: c.id, name: c.name, from, to: from ?? "none", top: from === null ? 0 : from * ROW, grab, x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (drag) track(e.clientX, e.clientY);
    },
    onPointerUp: () => {
      const d = drag;
      setDrag(null);
      if (!d || d.to === null) return;
      const slot = d.to === "none" ? null : d.to;
      if (slot === d.from) return;
      move(d.id, slot);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      // Arrow keys move it one position; the one there moves along.
      const from = c.rackSlot;
      const to = e.key === "ArrowUp" ? (from ?? size) - 1 : e.key === "ArrowDown" ? (from === null ? 0 : from + 1) : null;
      if (to === null) return;
      e.preventDefault();
      if (to >= 0 && to < size) move(c.id, to);
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
  const labelW = arranging ? 64 : 48;

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
      {arranging && (
        <p className="text-[13px] text-muted">
          Drag ⠿ to move a box. Dropped on another box, it takes that position and the ones in between move along; dropped on an empty position, it just goes there. Type over a number to rename that position.
        </p>
      )}

      {/* The positions stay put; the boxes on top of them slide (DEC-035). */}
      <div ref={listRef} role="list" aria-label="Positions" className="relative rounded-2xl border border-border bg-surface select-none" style={{ height: size * ROW }}>
        {Array.from({ length: size }, (_, i) => {
          const label = rackLabel(labels, i);
          const target = drag && drag.to === i;
          return (
            <div
              key={`p${i}`}
              role="listitem"
              className={`absolute inset-x-0 flex items-center gap-3 px-3 ${i > 0 ? "border-t border-border" : ""} ${target ? (noRoom ? "bg-danger/10" : "bg-accent/10") : ""}`}
              style={{ top: i * ROW, height: ROW }}
            >
              <span className="flex shrink-0 justify-center" style={{ width: labelW }}>
                {arranging ? <LabelInput rack={rack} slot={i} /> : <span className="max-w-full truncate"><PositionTag position={label} big /></span>}
              </span>
              {preview[i] === null &&
                (arranging ? (
                  <span className="flex-1 text-sm italic text-muted">Empty</span>
                ) : (
                  <button type="button" onClick={() => setFilling(i)} className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 text-left" aria-label={`Position ${label} is empty: put something here`}>
                    <span className="text-sm italic text-muted">Empty</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-accent">
                      <Plus size={16} /> Put something here
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
        {placed.map((c) => {
          const following = drag?.id === c.id;
          const at = preview.indexOf(c.id);
          const top = following ? drag.top : at >= 0 ? at * ROW : c.rackSlot! * ROW;
          return (
            <div
              key={c.id}
              className={`absolute right-0 flex items-center gap-2 pr-2 ${
                following ? "z-10 rounded-xl bg-surface-2 shadow-xl ring-2 ring-accent" : "transition-[top] duration-200 ease-out motion-reduce:transition-none"
              }`}
              style={{ top, height: ROW, left: labelW + 24 }}
            >
              {arranging ? (
                rowName(c)
              ) : (
                <Link to={`/locations/${c.id}`} className="flex h-full min-w-0 flex-1 items-center gap-2">
                  {rowName(c)}
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              )}
              {arranging && (
                <button type="button" {...handle(c)} aria-label={`Move ${c.name}`} className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted active:cursor-grabbing">
                  <GripVertical size={20} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(unplaced.length > 0 || (arranging && drag && drag.from !== null)) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Not in a position</h3>
          <ul data-drop="none" className={`min-h-12 divide-y divide-border overflow-hidden rounded-2xl border border-dashed border-border ${drag?.to === "none" && drag.from !== null ? "bg-accent/10" : ""}`}>
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

      {/* A box coming in from "Not in a position" has no card above the positions yet: a label follows the finger. */}
      {drag && drag.from === null && (
        <span className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-fg shadow-lg" style={{ left: drag.x, top: drag.y }}>
          {drag.name}
          {typeof drag.to === "number" && (noRoom ? " · no room" : ` → ${rackLabel(labels, drag.to)}`)}
        </span>
      )}

      {filling !== null && <FillSlot rack={rack} slot={filling} unplaced={unplaced} onClose={() => setFilling(null)} place={(id) => move(id, filling)} />}
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
            <ScanTarget compact what="Scan the box or tote that goes here" />
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
