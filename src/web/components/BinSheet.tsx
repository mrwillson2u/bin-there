import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronRight, LogOut, Pencil, Plus, QrCode, X } from "lucide-react";
import type { CreateItem, ItemDetail, LocationDetail, LocationItem, LocationSummary, ScanResult } from "../../shared/api";
import { api, uploadPhoto } from "../api";
import { preparePhoto } from "../lib/photo";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { StockControl } from "./StockControl";
import { QtyBadge } from "./ItemList";
import { PhotoSpot } from "./PhotoSpot";
import { useToast } from "./Toast";
import { OutBanner, TakeOutForm } from "./TakeOut";
import { Badge, BinChip, Button, inputClass, itemName } from "./ui";

// A bin opened from its box's grid (DEC-020, reworked in DEC-024). It leads with what's
// in the bin. Most bins hold one part, so that part gets its photo (or a button to take
// one), its name and its count. An empty bin opens on the form for putting something in
// it; a bin with something in it keeps that form behind "Add another part". The sticker
// isn't shown: it's there for the scanner, not for reading, and is managed on the bin's
// own page and the Stickers screen.

const refreshAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["location"] });
  qc.invalidateQueries({ queryKey: ["locations"] });
  qc.invalidateQueries({ queryKey: ["items"] });
  qc.invalidateQueries({ queryKey: ["stats"] });
};

export function BinSheet({
  bin,
  box,
  onClose,
  onSwitch,
  docked = false,
}: {
  bin: LocationSummary;
  box: LocationDetail;
  onClose: () => void;
  /** A sticker for another bin in this box was scanned: show that one instead. */
  onSwitch: (bin: LocationSummary) => void;
  /** Desktop: sit in the column beside the grid instead of sliding up over it. */
  docked?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: detail } = useQuery({ queryKey: ["location", bin.id], queryFn: () => api<LocationDetail>(`/locations/${bin.id}`) });
  const [adding, setAdding] = useState(false);
  const [takingOut, setTakingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** An unused sticker scanned while the sheet is open: offered for this bin, never put on silently. */
  const [newSticker, setNewSticker] = useState<string | null>(null);

  useEffect(() => {
    setAdding(false);
    setTakingOut(false);
    setError(null);
    setNewSticker(null);
  }, [bin.id]);

  const sticker = useMutation({
    mutationFn: (code: string) => api<LocationDetail>(`/locations/${bin.id}/code`, { method: "POST", body: { code } }),
    onSuccess: () => {
      toast.show({ message: bin.code ? `New sticker is on ${bin.name}` : `Sticker added to ${bin.name}` });
      setNewSticker(null);
      refreshAll(qc);
    },
    onError: (e: Error) => setError(e.message),
  });

  // The hardware scanner while the sheet is open: another bin's sticker opens that bin
  // here; an unused sticker asks whether it's this bin's (nothing is written until you
  // say so, DEC-024); anything else opens as usual.
  useScanHandler((code) => {
    setError(null);
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unassigned") setNewSticker(r.code);
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

  const items = detail?.items ?? [];

  const content = (
    <>
      <div className="flex items-center gap-2">
        {bin.binSize && <BinChip size={bin.binSize} />}
        <Link to={`/locations/${bin.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-1 font-semibold" aria-label={`Open ${bin.name}`}>
          <span className="truncate">{bin.name}</span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-muted">
          <X size={20} />
        </button>
      </div>
      {!newSticker && <ScanTarget compact what={bin.code ? "Scan another bin to switch, or a new sticker to replace this one" : `Scan a new sticker to put it on ${bin.name}`} />}

      {newSticker && (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent/50 bg-accent/10 p-3" role="group" aria-label="New sticker scanned">
          <p className="flex items-center gap-2 font-semibold">
            <QrCode size={18} className="shrink-0 text-accent" /> New sticker scanned
          </p>
          <p className="text-sm text-muted">
            {bin.code ? `${bin.name} already has a sticker. Use this one instead?` : `It isn't on anything yet. Is it the sticker for ${bin.name}?`}
          </p>
          <Button variant="primary" disabled={sticker.isPending} onClick={() => sticker.mutate(newSticker)}>
            {bin.code ? `Use it on ${bin.name}` : `Put it on ${bin.name}`}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="px-2" onClick={() => navigate(`/scan/${encodeURIComponent(newSticker)}`)}>It's for something else</Button>
            <Button variant="ghost" className="px-2" onClick={() => setNewSticker(null)}>Not now</Button>
          </div>
        </div>
      )}

      {detail?.out && <OutBanner bin={detail} boxName={box.name} />}

      {detail === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="-mt-1 text-sm text-muted">Nothing in it yet.</p>
      ) : items.length === 1 ? (
        <OnePart item={items[0]!} bin={bin} />
      ) : (
        <PartList items={items} bin={bin} />
      )}

      {detail !== undefined &&
        (takingOut ? (
          <TakeOutForm bin={bin} onDone={() => setTakingOut(false)} onCancel={() => setTakingOut(false)} />
        ) : items.length === 0 || adding ? (
          <AddPart bin={bin} first={items.length === 0} onDone={() => setAdding(false)} onCancel={items.length > 0 ? () => setAdding(false) : undefined} />
        ) : (
          <div className="flex flex-wrap gap-x-4">
            <Button variant="ghost" className="px-1" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add another part
            </Button>
            {/* Taking the whole bin to the bench or a project kit; its spot stays saved (DEC-028). */}
            {!detail.out && (
              <Button variant="ghost" className="px-1" onClick={() => setTakingOut(true)}>
                <LogOut size={18} /> Take out
              </Button>
            )}
          </div>
        ))}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      {/* Deleting a bin is on its own page (tap its name above), not in this quick view. */}
    </>
  );

  if (docked) {
    return (
      <section role="dialog" aria-label={`${bin.name} in ${box.name}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        {content}
      </section>
    );
  }
  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={`${bin.name} in ${box.name}`}
        data-sheet
        className="fixed inset-x-0 bottom-0 z-20 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl"
      >
        {content}
      </section>
    </>
  );
}

/** The usual case: one kind of part in the bin. Its photo, name and count, and ways to fix them. */
export function OnePart({ item: i, bin }: { item: LocationItem; bin: LocationSummary }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const label = itemName(i.name);

  const rename = useMutation({
    // The server keeps "needs details" until the part has a category too (DEC-007).
    mutationFn: (name: string) => api<ItemDetail>(`/items/${i.itemId}`, { method: "PATCH", body: { name } }),
    onSuccess: (d) => {
      qc.setQueryData(["item", d.id], d);
      toast.show({ message: `Renamed to ${d.name}` });
      setDraft(null);
      refreshAll(qc);
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <PhotoSpot itemId={i.itemId} url={i.thumbUrl} size={112} label={label} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {draft !== null ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) rename.mutate(draft.trim());
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} aria-label="Part name" placeholder="What is it?" autoFocus />
              <div className="flex gap-2">
                <Button variant="primary" type="submit" disabled={!draft.trim() || rename.isPending}>Save</Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="flex items-start gap-1">
              <Link to={`/items/${i.itemId}`} className={`line-clamp-3 min-w-0 flex-1 pt-2 text-lg font-semibold leading-snug ${i.name ? "" : "italic text-muted"}`}>
                {label}
              </Link>
              <button type="button" onClick={() => setDraft(i.name)} aria-label={i.name ? `Rename ${label}` : "Name this part"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted">
                <Pencil size={18} />
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {i.units > 0 && <Badge tone="info">{i.units} stickered</Badge>}
            <Link to={`/items/${i.itemId}/edit`} className={`text-sm ${i.needsDetails ? "text-warn" : "text-accent"}`}>
              {i.needsDetails ? "Add details" : "Edit details"}
            </Link>
          </div>
        </div>
      </div>
      {i.hasStock ? (
        <StockControl itemId={i.itemId} locationId={bin.id} placeName={bin.name} tracking={i.tracking} qty={i.qty} level={i.level} stale={i.stale} />
      ) : (
        i.units === 0 && <QtyBadge qty={i.qty} level={i.level} units={i.units} tracking={i.tracking} />
      )}
    </div>
  );
}

/** Two or more parts: a row each, with a photo (or a button to take one) and the count. */
function PartList({ items, bin }: { items: LocationItem[]; bin: LocationSummary }) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border">
      {items.map((i) => {
        const stock = i.hasStock && (
          <StockControl itemId={i.itemId} locationId={bin.id} placeName={bin.name} tracking={i.tracking} qty={i.qty} level={i.level} stale={i.stale} compact />
        );
        return (
          <li key={i.itemId} className="flex flex-col gap-2 px-3 py-2">
            <div className="flex items-center gap-3">
              <PhotoSpot itemId={i.itemId} url={i.thumbUrl} size={48} label={itemName(i.name)} />
              <Link to={`/items/${i.itemId}`} className={`min-w-0 flex-1 ${i.name ? "" : "italic text-muted"}`}>
                <span className="line-clamp-2">{itemName(i.name)}</span>
              </Link>
              {i.units > 0 && <Badge tone="info">{i.units} stickered</Badge>}
              {i.tracking === "exact" ? stock : null}
              {!i.hasStock && i.units === 0 && <QtyBadge qty={i.qty} level={i.level} units={i.units} tracking={i.tracking} />}
            </div>
            {i.tracking === "level" && stock}
          </li>
        );
      })}
    </ul>
  );
}

/** Put a part in the bin: a name, a photo, or both, and how many if you know. */
function AddPart({ bin, first, onDone, onCancel }: { bin: LocationSummary; first: boolean; onDone: () => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const add = useMutation({
    mutationFn: async (body: CreateItem) => {
      let item = await api<ItemDetail>("/items", { method: "POST", body });
      if (photo) {
        const { photo: p, thumb } = await preparePhoto(photo);
        item = await uploadPhoto<ItemDetail>(item.id, p, thumb);
      }
      return item;
    },
    onSuccess: (item) => {
      toast.show({ message: `${itemName(item.name)} added to ${bin.name}` });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => refreshAll(qc),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !photo) return;
    setError(null);
    add.mutate({ name: name.trim() || undefined, locationId: bin.id, qty: qty ? Number(qty) : undefined });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted">{first ? "What goes in it?" : "Another part"}</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-9 px-1 text-sm text-accent">Cancel</button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 text-accent"
          title="Add a photo of it"
        >
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Camera size={20} />}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={photo ? "Retake the photo" : "Add a photo of it"}
            onChange={(e) => {
              setPhoto(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} min-w-0 flex-1`}
          placeholder={photo ? "Name (later is fine)" : "What is it?"}
          aria-label="Part name"
          autoFocus
          enterKeyHint="done"
        />
        <input
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          className={`${inputClass} w-16 text-center font-mono`}
          placeholder="#"
          aria-label="How many"
        />
        <Button variant="primary" type="submit" disabled={(!name.trim() && !photo) || add.isPending} className="px-3">
          {add.isPending ? "…" : "Add"}
        </Button>
      </div>
      {photo && (
        <button type="button" onClick={() => setPhoto(null)} className="self-start text-[13px] text-muted">
          Remove the photo
        </button>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </form>
  );
}
