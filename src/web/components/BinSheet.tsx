import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Trash2, X } from "lucide-react";
import type { CreateItem, ItemDetail, LocationDetail, LocationSummary, ScanResult } from "../../shared/api";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { StockControl } from "./StockControl";
import { QtyBadge } from "./ItemList";
import { useToast } from "./Toast";
import { Badge, BinChip, Button, inputClass, itemName } from "./ui";

// A bin opened from its box's grid (DEC-020): what's in it, a quick-add row that
// stays put for the next part, and a scan to put a sticker on it. The full bin
// screen is one tap away for everything else.

export function BinSheet({
  bin,
  box,
  onClose,
  onSwitch,
}: {
  bin: LocationSummary;
  box: LocationDetail;
  onClose: () => void;
  /** A sticker for another bin in this box was scanned: show that one instead. */
  onSwitch: (bin: LocationSummary) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: detail } = useQuery({ queryKey: ["location", bin.id], queryFn: () => api<LocationDetail>(`/locations/${bin.id}`) });
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const add = useMutation({
    mutationFn: (body: CreateItem) => api<ItemDetail>("/items", { method: "POST", body }),
    onSuccess: (item) => {
      toast.show({ message: `${itemName(item.name)} added to ${bin.name}` });
      setName("");
      setQty("");
      setError(null);
      refresh();
      nameRef.current?.focus();
    },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate({ name: name.trim(), locationId: bin.id, qty: qty ? Number(qty) : undefined });
  };

  const sticker = useMutation({
    mutationFn: (code: string) => api<LocationDetail>(`/locations/${bin.id}/code`, { method: "POST", body: { code } }),
    onSuccess: (l) => {
      toast.show({ message: `Sticker ${l.code} is now on ${bin.name}` });
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api(`/locations/${bin.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.show({ message: `${bin.name} removed` });
      qc.removeQueries({ queryKey: ["location", bin.id] });
      refresh();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  // A scan while the sheet is open: a fresh sticker goes on this bin; another bin's
  // sticker opens that bin; anything else opens as usual.
  useScanHandler((code) => {
    setError(null);
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unassigned") sticker.mutate(r.code);
        else if (r.kind === "location") {
          const sibling = box.children.find((c) => c.id === r.location.id);
          if (sibling) onSwitch(sibling);
          else navigate(`/locations/${r.location.id}`);
        } else navigate(`/items/${r.itemId}`);
      })
      .catch((e: Error) => setError(e.message));
    return true;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const live = detail ?? null;
  const items = live?.items ?? [];
  const empty = live !== null && items.length === 0 && live.children.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={`${bin.name} in ${box.name}`}
        className="fixed inset-x-0 bottom-0 z-20 flex max-h-[80dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl lg:left-56 lg:mx-auto lg:max-w-2xl lg:rounded-2xl lg:border lg:bottom-6"
      >
        <div className="flex items-center gap-2">
          {bin.binSize && <BinChip size={bin.binSize} />}
          <Link to={`/locations/${bin.id}`} className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
            <span className="truncate">{bin.name}</span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-muted">
            <X size={20} />
          </button>
        </div>
        <p className="-mt-2 text-[13px] text-muted">
          {bin.code ? (
            <>sticker <span className="font-mono">{bin.code}</span></>
          ) : (
            <>No sticker yet. Scan one to put it on this bin.</>
          )}
        </p>

        {live === null ? (
          <p className="text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-2 text-center text-muted">Nothing in it yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {items.map((i) => (
              <li key={i.itemId} className="flex items-center gap-2 px-3 py-2">
                <Link to={`/items/${i.itemId}`} className={`min-w-0 flex-1 truncate ${i.name ? "" : "italic text-muted"}`}>
                  {itemName(i.name)}
                </Link>
                {i.units > 0 && <Badge tone="info">{i.units} stickered</Badge>}
                {i.hasStock ? (
                  <StockControl itemId={i.itemId} locationId={bin.id} placeName={bin.name} tracking={i.tracking} qty={i.qty} level={i.level} stale={i.stale} compact />
                ) : (
                  i.units === 0 && <QtyBadge qty={i.qty} level={i.level} units={i.units} tracking={i.tracking} />
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13px] text-muted">Add a part</span>
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="What is it?" autoFocus enterKeyHint="done" />
          </label>
          <label className="flex w-20 flex-col gap-1">
            <span className="text-[13px] text-muted">How many</span>
            <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className={`${inputClass} text-center font-mono`} placeholder="—" aria-label="How many" />
          </label>
          <Button variant="primary" type="submit" disabled={!name.trim() || add.isPending}>
            Add
          </Button>
        </form>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        {empty && (
          <Button variant="ghost" className="self-start" disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 size={16} /> Remove this bin
          </Button>
        )}
      </section>
    </>
  );
}
