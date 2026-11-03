import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, House, MapPinPlus, MoveRight, Pencil, QrCode, ScanLine } from "lucide-react";
import {
  itemKindLabels,
  trackingLabels,
  type ItemDetail,
  type Place,
  type StockResult,
} from "../../shared/api";
import { api, uploadPhoto } from "../api";
import { preparePhoto } from "../lib/photo";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { StockControl, useStockMutation } from "../components/StockControl";
import { PickLocation } from "../components/PickLocation";
import { EventList } from "../components/EventList";
import { useToast } from "../components/Toast";
import { PinButton } from "../components/PinButton";
import { Badge, Button, Card, inputClass, itemName, pathText } from "../components/ui";

type Mode =
  | { kind: "move"; place: Place }
  | { kind: "addPlace" }
  | { kind: "moveUnit"; unitId: number; code: string | null }
  | { kind: "addUnit" }
  | null;

export function ItemPage() {
  const id = Number(useParams().id);
  const { data: item, error } = useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });
  const [mode, setMode] = useState<Mode>(null);

  if (error) return <p className="text-danger">{(error as Error).message}</p>;
  if (!item) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Header item={item} />

      {item.needsDetails && (
        <Link to={`/items/${item.id}/edit`} className="flex min-h-12 items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 text-warn">
          <Pencil size={18} /> Needs details: tap to fill in
        </Link>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Where</h2>
          {item.totalQty !== null && item.places.length > 1 && (
            <span className="text-sm text-muted"><span className="font-mono text-text">{item.totalQty}</span> total</span>
          )}
        </div>
        {item.places.length === 0 && <p className="text-muted">Not in any location yet.</p>}
        {item.places.map((p) => (
          <PlaceCard key={p.locationId} item={item} place={p} onMove={() => setMode({ kind: "move", place: p })} />
        ))}

        {mode?.kind === "move" && <MoveStock item={item} place={mode.place} done={() => setMode(null)} />}
        {mode?.kind === "addPlace" && <AddPlace item={item} done={() => setMode(null)} />}
        {mode === null && (
          <Button onClick={() => setMode({ kind: "addPlace" })} className="self-start">
            <MapPinPlus size={18} /> Add another place
          </Button>
        )}
      </section>

      {(item.kind === "returnable" || item.unitList.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Stickered units</h2>
          {item.unitList.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {item.unitList.map((u) => (
                <li key={u.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm">{u.code ?? "no sticker"}</span>
                    <span className="block truncate text-[13px] text-muted">{u.path.length ? pathText(u.path) : "No location"}</span>
                  </span>
                  <Button variant="ghost" onClick={() => setMode({ kind: "moveUnit", unitId: u.id, code: u.code })}>
                    <MoveRight size={18} /> Move
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {mode?.kind === "moveUnit" && <MoveUnit unitId={mode.unitId} code={mode.code} done={() => setMode(null)} />}
          {mode?.kind === "addUnit" && <AddUnit item={item} done={() => setMode(null)} />}
          {mode === null && (
            <Button onClick={() => setMode({ kind: "addUnit" })} className="self-start">
              <QrCode size={18} /> Add another stickered one
            </Button>
          )}
        </section>
      )}

      <Details item={item} />

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">History</h2>
        <EventList events={item.history} showItem={false} />
      </section>
    </div>
  );
}

function Header({ item }: { item: ItemDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const photo = item.photos[0];

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { photo, thumb } = await preparePhoto(file);
      const updated = await uploadPhoto<ItemDetail>(item.id, photo, thumb);
      qc.setQueryData(["item", item.id], updated);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["location"] });
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {photo ? (
        <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-surface-2">
          <img src={photo.url} alt="" className="max-h-72 w-full object-contain" />
        </a>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className={`text-xl font-semibold ${item.name ? "" : "italic text-muted"}`}>{itemName(item.name)}</h1>
          <p className="text-[13px] text-muted">
            {[item.categoryName, itemKindLabels[item.kind], trackingLabels[item.tracking]].filter(Boolean).join(" · ")}
          </p>
        </div>
        <PinButton kind="item" id={item.id} pinned={item.pinned} />
        <Link to={`/items/${item.id}/edit`} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-accent">
          <Pencil size={18} /> Edit
        </Link>
      </div>
      <div className="flex gap-2">
        <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 ${busy ? "opacity-50" : ""}`}>
          <Camera size={18} /> {busy ? "Uploading…" : photo ? "Add photo" : "Take photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => addPhoto(e.target.files?.[0])} />
        </label>
        {item.photos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {item.photos.slice(1).map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img src={p.thumbUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceCard({ item, place, onMove }: { item: ItemDetail; place: Place; onMove: () => void }) {
  const qc = useQueryClient();
  const homes = item.places.filter((p) => p.isHome).map((p) => p.locationId);
  const toggleHome = useMutation({
    mutationFn: () =>
      api<ItemDetail>(`/items/${item.id}/homes`, {
        method: "PUT",
        body: { locationIds: place.isHome ? homes.filter((h) => h !== place.locationId) : [...homes, place.locationId] },
      }),
    onSuccess: (d) => qc.setQueryData(["item", item.id], d),
  });
  const name = place.path.at(-1)?.name ?? "";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <Link to={`/locations/${place.locationId}`} className="min-w-0 flex-1">
          {place.path.length > 1 && <span className="block text-[13px] text-muted">{pathText(place.path.slice(0, -1))}</span>}
          <span className="block font-semibold">{name}</span>
        </Link>
        <button
          onClick={() => toggleHome.mutate()}
          aria-pressed={place.isHome}
          className={`flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] ${place.isHome ? "text-ok" : "text-muted"}`}
          title="Home = where it belongs. Used by put-back."
        >
          <House size={16} /> {place.isHome ? "Home" : "Make home"}
        </button>
      </div>
      {place.hasStock && (
        <StockControl
          itemId={item.id}
          locationId={place.locationId}
          placeName={name}
          tracking={item.tracking}
          qty={place.qty}
          level={place.level}
          stale={place.stale}
        />
      )}
      <div className="flex items-center gap-2">
        {place.units > 0 && <Badge tone="info">{place.units} stickered</Badge>}
        <span className="flex-1" />
        {place.hasStock && (
          <Button variant="ghost" onClick={onMove}>
            <MoveRight size={18} /> Move
          </Button>
        )}
      </div>
    </Card>
  );
}

function MoveStock({ item, place, done }: { item: ItemDetail; place: Place; done: () => void }) {
  const handlers = useStockMutation();
  const [qty, setQty] = useState("");
  const partial = item.tracking === "exact" && place.qty !== null && place.qty > 1;
  const move = useMutation({
    mutationFn: (to: { id: number; name: string }) =>
      api<StockResult>("/stock/move", {
        method: "POST",
        body: { itemId: item.id, fromLocationId: place.locationId, toLocationId: to.id, qty: qty ? Number(qty) : undefined },
      }),
    ...handlers((_, to: { name: string }) => `Moved to ${to.name}`),
    onSettled: done,
  });
  return (
    <PickLocation title={`Move from ${place.path.at(-1)?.name}: scan where it's going`} onPick={(l) => move.mutate(l)} onCancel={done}>
      {partial && (
        <label className="flex items-center gap-2 text-sm text-muted">
          How many?
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            placeholder={`all ${place.qty}`}
            className={`${inputClass} w-28 text-center font-mono`}
          />
        </label>
      )}
    </PickLocation>
  );
}

function AddPlace({ item, done }: { item: ItemDetail; done: () => void }) {
  const handlers = useStockMutation();
  const add = useMutation({
    mutationFn: (to: { id: number; name: string }) =>
      api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: to.id, qty: null } }),
    ...handlers((_, to: { name: string }) => `Added to ${to.name}`),
    onSettled: done,
  });
  return <PickLocation title="Scan the bin or box it's also in" onPick={(l) => add.mutate(l)} onCancel={done} />;
}

function MoveUnit({ unitId, code, done }: { unitId: number; code: string | null; done: () => void }) {
  const handlers = useStockMutation();
  const move = useMutation({
    mutationFn: (to: { id: number; name: string }) =>
      api<StockResult>(`/units/${unitId}/move`, { method: "POST", body: { toLocationId: to.id } }),
    ...handlers((_, to: { name: string }) => `Moved to ${to.name}`),
    onSettled: done,
  });
  return <PickLocation title={`Move ${code ?? "unit"}: scan where it's going`} onPick={(l) => move.mutate(l)} onCancel={done} />;
}

function AddUnit({ item, done }: { item: ItemDetail; done: () => void }) {
  const handlers = useStockMutation();
  const { openCamera } = useScan();
  const home = item.places.find((p) => p.isHome)?.locationId ?? null;
  const add = useMutation({
    mutationFn: (code: string) => api<StockResult>("/units", { method: "POST", body: { itemId: item.id, code, locationId: home } }),
    ...handlers(() => "Sticker added"),
    onSettled: done,
  });
  useScanHandler((code) => {
    add.mutate(code);
    return true;
  });
  return (
    <Card className="flex flex-col gap-3 border-accent/50 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <ScanLine size={20} className="text-accent" /> Scan the new sticker on it
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={openCamera}>Scan with camera</Button>
        <Button variant="ghost" onClick={done}>Cancel</Button>
      </div>
    </Card>
  );
}

function Details({ item }: { item: ItemDetail }) {
  const labels = new Map(item.fieldDefs.map((f) => [f.key, f.label]));
  const rows: [string, React.ReactNode][] = [
    ...Object.entries(item.attributes).map(([k, v]) => [labels.get(k) ?? k, v] as [string, string]),
    ...(item.price !== null ? [["Price", `$${item.price.toFixed(2)}`] as [string, string]] : []),
    ...(item.supplier ? [["Supplier", item.supplier] as [string, string]] : []),
    ...(item.supplierPn ? [["Supplier part #", <span className="font-mono">{item.supplierPn}</span>] as [string, React.ReactNode]] : []),
  ];
  if (rows.length === 0 && !item.url && !item.notes) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Details</h2>
      <Card className="flex flex-col gap-2 p-4">
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent">
            <ExternalLink size={16} /> Product link
          </a>
        )}
        {item.notes && <p className="whitespace-pre-wrap text-sm">{item.notes}</p>}
      </Card>
    </section>
  );
}
