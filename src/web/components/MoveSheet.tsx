import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { ItemDetail, ScanResult, StockResult } from "../../shared/api";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { PickLocation } from "./PickLocation";
import { useStockMutation } from "./StockControl";
import { Button, inputClass, itemName } from "./ui";

/**
 * Where the Move sheet was opened from (DEC-067): a place the part is in, the part's "No place
 * yet" (things that aren't anywhere), or one stickered unit's row. It only decides which choice
 * starts ticked; the choices and the wording are the same from everywhere.
 */
export type MoveStart = { kind: "nowhere" } | { kind: "place"; locationId: number } | { kind: "unit"; unitId: number };

type Dest = { id: number; name: string };
type Option = {
  key: string;
  label: ReactNode;
  /** What the button says is moving: "3", "all of it", "everything". */
  what: () => string;
  ready: () => boolean;
  run: (to: Dest) => Promise<StockResult>;
};

/**
 * The one way to place or move a part's things (DEC-067): it always asks what's moving (all,
 * just this one, pick which, or some of a count), then where, and its button says exactly what
 * will happen ("Move 3 to Nano Tote"). Scanning a unit's sticker ticks it; scanning a place picks it.
 */
export function MoveSheet({ itemId, start, onClose }: { itemId: number; start: MoveStart; onClose: () => void }) {
  const { data: item } = useQuery({ queryKey: ["item", itemId], queryFn: () => api<ItemDetail>(`/items/${itemId}`) });
  return (
    <Overlay label={item ? `Move ${itemName(item.name)}` : "Move"} onClose={onClose}>
      {item ? <Sheet item={item} start={start} onClose={onClose} /> : <p className="text-muted">Loading…</p>}
    </Overlay>
  );
}

function Sheet({ item, start, onClose }: { item: ItemDetail; start: MoveStart; onClose: () => void }) {
  const handlers = useStockMutation();
  const name = itemName(item.name);
  // Stickered ones that are in (a checked-out one comes back with Check in, not Move).
  const active = item.unitList.filter((u) => !u.out);
  const out = item.unitList.length - active.length;
  const startUnit = start.kind === "unit" ? active.find((u) => u.id === start.unitId) : undefined;
  const startPlace = start.kind === "place" ? item.places.find((p) => p.locationId === start.locationId) : undefined;
  const placeName = startPlace?.path.at(-1)?.name ?? "";
  const here = start.kind === "nowhere" ? active.filter((u) => u.locationId === null) : start.kind === "place" ? active.filter((u) => u.locationId === start.locationId) : [];
  // Pick which starts empty (tick or scan the ones to move), or with the unit whose row opened it.
  const [picked, setPicked] = useState<Set<number>>(() => new Set(startUnit ? [startUnit.id] : []));
  const [some, setSome] = useState("");
  const [to, setTo] = useState<Dest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const moveUnits = (ids: number[]) => (dest: Dest) => api<StockResult>("/units/move", { method: "POST", body: { unitIds: ids, toLocationId: dest.id } });
  const options: Option[] = [];
  const n = (k: number) => () => String(k);
  if (startUnit) {
    options.push({ key: "one", label: <><b>Just this one</b> <span className="font-mono text-sm">{startUnit.code ?? `unit ${startUnit.id}`}</span></>, what: n(1), ready: () => true, run: moveUnits([startUnit.id]) });
  }
  if (!startUnit && here.length > 0) {
    const label =
      here.length === active.length ? <><b>All {here.length}</b> stickered {here.length === 1 ? "one" : "ones"}</>
      : start.kind === "nowhere" ? <><b>All {here.length}</b> with no place yet</>
      : <><b>All {here.length}</b> in {placeName}</>;
    options.push({ key: "here", label, what: n(here.length), ready: () => true, run: moveUnits(here.map((u) => u.id)) });
  }
  if (active.length > 1 && (startUnit || here.length < active.length)) {
    options.push({ key: "all", label: <><b>All {active.length}</b> stickered ones</>, what: n(active.length), ready: () => true, run: moveUnits(active.map((u) => u.id)) });
  }
  if (active.length > 1) {
    options.push({ key: "pick", label: <><b>Pick which</b> <span className="text-[13px] text-muted">· tap, or scan their stickers</span></>, what: () => String(picked.size), ready: () => picked.size > 0, run: (dest) => moveUnits([...picked])(dest) });
  }
  // The part's own count in this place (loose, not stickered).
  if (startPlace?.hasStock) {
    const from = startPlace.locationId;
    const counted = item.tracking === "exact" && startPlace.qty !== null;
    const moveStock = (qty?: number) => (dest: Dest) => api<StockResult>("/stock/move", { method: "POST", body: { itemId: item.id, fromLocationId: from, toLocationId: dest.id, qty } });
    if (counted) {
      const q = startPlace.qty!;
      options.push({ key: "stock", label: <><b>All {q}</b> from {placeName}</>, what: n(q), ready: () => true, run: moveStock() });
      if (q > 1) {
        options.push({
          key: "some",
          label: (
            <span className="flex flex-wrap items-center gap-2">
              <b>Some</b>
              <input
                inputMode="numeric"
                value={some}
                onChange={(e) => setSome(e.target.value.replace(/\D/g, ""))}
                onFocus={() => setChoice("some")}
                placeholder="how many"
                className={`${inputClass} min-h-9 w-24 py-0 text-center font-mono`}
                aria-label="How many to move"
              />
              <span className="text-[13px] text-muted">of {q}</span>
            </span>
          ),
          what: () => some || "some",
          ready: () => Number(some) > 0 && Number(some) <= q,
          run: (dest) => moveStock(Number(some))(dest),
        });
      }
    } else {
      options.push({ key: "stock", label: <><b>All of it</b> from {placeName}</>, what: () => "all of it", ready: () => true, run: moveStock() });
      options.push({
        key: "also",
        label: <><b>Some of it</b> <span className="text-[13px] text-muted">· it'll be in both places</span></>,
        what: () => "some",
        ready: () => true,
        run: (dest) => api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: dest.id, qty: null } }),
      });
    }
  }
  // Nothing recorded anywhere and nothing stickered: put it somewhere.
  if (start.kind === "nowhere" && active.length === 0 && item.places.length === 0) {
    options.push({ key: "put", label: <><b>All of it</b></>, what: () => "all of it", ready: () => true, run: (dest) => api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: dest.id, qty: null } }) });
  }
  // In two or more places (no place counts as one): everything to one place, in one step. An empty
  // "not counted" entry beside stickered ones isn't a place it's in (they count themselves).
  const real = item.places.filter((p) => p.units > 0 || (p.hasStock && (p.qty !== null || p.level !== null || active.length === 0)));
  const spots = real.length + (active.some((u) => u.locationId === null) ? 1 : 0);
  if (spots >= 2) {
    options.push({ key: "everything", label: <><b>Everything it has</b> <span className="text-[13px] text-muted">· from {spots === 2 ? "both places" : `all ${spots} places`}</span></>, what: () => "everything", ready: () => true, run: (dest) => api<StockResult>(`/items/${item.id}/move-everything`, { method: "POST", body: { toLocationId: dest.id } }) });
  }

  const [choice, setChoice] = useState<string>(() => options[0]?.key ?? "");
  const chosen = options.find((o) => o.key === choice) ?? options[0];

  const toggle = (id: number) => {
    setChoice("pick");
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // A unit's sticker ticks it (switching to Pick which); a place's sticker picks where.
  const onUnitScan = (r: ScanResult) => {
    if (r.kind !== "unit") return false;
    const u = active.find((x) => x.id === r.unitId);
    if (!u) {
      setError(r.itemId === item.id ? "That one is checked out: check it in first" : "That sticker is on a different part");
      return true;
    }
    setError(null);
    // The first sticker scanned starts the selection (with the unit whose row opened the sheet);
    // more scans add to it. A second read of the same sticker never unticks it.
    if (chosen?.key !== "pick") setPicked(new Set([...(startUnit ? [startUnit.id] : []), u.id]));
    else setPicked((p) => new Set(p).add(u.id));
    setChoice("pick");
    return true;
  };
  useScanHandler((code) => {
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "location") {
          setError(null);
          setTo(r.location);
        } else if (!onUnitScan(r)) setError("That sticker isn't on a place or on one of this part's");
      })
      .catch((e: Error) => setError(e.message));
    return true;
  });

  const move = useMutation({
    mutationFn: ({ option, dest }: { option: Option; dest: Dest }) => option.run(dest),
    ...handlers((_, v: { option: Option; dest: Dest }) => `Moved ${v.option.what()} to ${v.dest.name}`),
  });

  if (!chosen) return <p className="text-muted">There's nothing of this part to move.</p>;
  const ready = !!to && chosen.ready() && !move.isPending;
  const near = startPlace?.path ?? (startUnit && startUnit.path.length ? startUnit.path : undefined);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="pr-10 text-lg font-semibold">Move {name}</h2>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">What's moving?</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="What's moving">
        {options.map((o) => (
          <div
            key={o.key}
            role="radio"
            aria-checked={o.key === chosen.key}
            tabIndex={0}
            onClick={(e) => {
              setChoice(o.key);
              // A tap doesn't leave keyboard focus behind: a hardware scan types like a keyboard,
              // and the browser would then outline this choice as if it were a second selection.
              if (e.detail > 0) e.currentTarget.blur();
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") setChoice(o.key);
            }}
            className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${o.key === chosen.key ? "border-accent bg-accent/10" : "border-border bg-bg"}`}
          >
            <span className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-2 ${o.key === chosen.key ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--color-bg)]" : "border-muted"}`} aria-hidden />
            <div className="min-w-0 flex-1">
              {o.label}
              {o.key === "pick" && o.key === chosen.key && (
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
                  {active.map((u) => (
                    <li key={u.id}>
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4" aria-label={`Move ${u.code ?? `unit ${u.id}`}`} />
                        <span className="font-mono">{u.code ?? `unit ${u.id}`}</span>
                        <span className="truncate text-[13px] text-muted">· {u.path.at(-1)?.name ?? "no place yet"}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      {out > 0 && <p className="text-[13px] text-muted">{out === 1 ? "One is" : `${out} are`} checked out and stay{out === 1 ? "s" : ""} out until checked in.</p>}

      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Where to?</p>
      {to ? (
        <div className="flex items-center gap-2 rounded-xl border border-ok/60 bg-ok/5 px-3 py-2.5" data-move-to>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ok" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold">{to.name}</span>
          <button type="button" onClick={() => setTo(null)} className="min-h-9 px-2 text-sm text-accent">
            Change
          </button>
        </div>
      ) : (
        <PickLocation
          title={active.length > 1 ? "Scan where they're going, or scan the ones you want to move" : "Scan where it's going"}
          onPick={(l) => {
            setError(null);
            setTo(l);
          }}
          onCancel={onClose}
          near={near}
          onOtherScan={onUnitScan}
        />
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <Button
        variant="primary"
        className="min-h-12 w-full justify-center text-base"
        disabled={!ready}
        onClick={() => to && move.mutate({ option: chosen, dest: to }, { onSuccess: onClose })}
      >
        {chosen.key === "pick" && picked.size === 0 ? "Tick or scan the ones to move" : `Move ${chosen.what()} to ${to ? to.name : "…"}`}
      </Button>
    </div>
  );
}

/** A sheet from the bottom on a phone, a centred panel on a computer; Escape or the backdrop closes it. */
function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center lg:p-[5vh]">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:max-h-full lg:w-[34rem] lg:rounded-2xl lg:border lg:p-6"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-muted">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
