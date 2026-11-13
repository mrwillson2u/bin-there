import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, House, LogIn, LogOut, MapPinPlus, MoveRight, Pencil, QrCode, Sparkles } from "lucide-react";
import {
  itemKindLabels,
  trackingLabels,
  type ItemDetail,
  type Place,
  type StockResult,
  type Unit,
} from "../../shared/api";
import { api } from "../api";
import { useWide } from "../lib/useWide";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { StockControl, useStockMutation } from "../components/StockControl";
import { PickLocation } from "../components/PickLocation";
import { EventList, timeAgo } from "../components/EventList";
import { PinButton } from "../components/PinButton";
import { Badge, Button, Card, inputClass, itemName, PlacePath } from "../components/ui";
import { WhereBlock } from "../components/WhereMap";
import { PartPhotos } from "../components/PartPhotos";

type Mode =
  | { kind: "move"; place: Place }
  | { kind: "addPlace" }
  | { kind: "moveUnit"; unitId: number; code: string | null }
  | { kind: "addUnit" }
  | { kind: "checkOut"; unitId: number; code: string | null }
  | null;

export function ItemPage() {
  const id = Number(useParams().id);
  const { data: item, error } = useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });
  const [mode, setMode] = useState<Mode>(null);
  const wide = useWide();

  if (error) return <p className="text-danger">{(error as Error).message}</p>;
  if (!item) return <p className="text-muted">Loading…</p>;

  const needs = item.needsDetails && (
    <Link to={`/items/${item.id}/edit`} className="flex min-h-12 items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 text-warn">
      <Pencil size={18} /> Needs details: tap to fill in
    </Link>
  );
  const where = (
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
  );
  const units = (item.kind === "returnable" || item.unitList.length > 0) && (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Stickered units</h2>
      {item.unitList.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {item.unitList.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm">{u.code ?? "no sticker"}</span>
                  {u.out && <Badge tone="info">out {timeAgo(u.out.at)}</Badge>}
                </span>
                {u.path.length ? (
                  <PlacePath path={u.path} after={u.out?.note && ` · ${u.out.note}`} className="text-[13px] text-muted" />
                ) : (
                  <span className="block truncate text-[13px] text-muted">{u.out ? (u.out.note ?? "") : "No location"}</span>
                )}
                <UnitFields item={item} unit={u} />
              </span>
              <span className="flex">
                {u.out ? (
                  <UnitCheckIn unitId={u.id} />
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setMode({ kind: "checkOut", unitId: u.id, code: u.code })}>
                      <LogOut size={18} /> Check out
                    </Button>
                    <Button variant="ghost" onClick={() => setMode({ kind: "moveUnit", unitId: u.id, code: u.code })} aria-label="Move">
                      <MoveRight size={18} />
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {mode?.kind === "moveUnit" && <MoveUnit unitId={mode.unitId} code={mode.code} done={() => setMode(null)} />}
      {mode?.kind === "checkOut" && <CheckOutUnit unitId={mode.unitId} code={mode.code} done={() => setMode(null)} />}
      {mode?.kind === "addUnit" && <AddUnit item={item} done={() => setMode(null)} />}
      {mode === null && (
        <Button onClick={() => setMode({ kind: "addUnit" })} className="self-start">
          <QrCode size={18} /> Add another stickered one
        </Button>
      )}
    </section>
  );
  const history = (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">History</h2>
      <EventList events={item.history} showItem={false} />
    </section>
  );

  // Desktop / Pi: photo and details on the left; where it is, units and history on the right.
  if (wide) {
    return (
      <div className="grid grid-cols-2 items-start gap-6">
        <div className="flex flex-col gap-4">
          <Header item={item} />
          {needs}
          <Details item={item} />
        </div>
        <div className="flex flex-col gap-4">
          {where}
          {units}
          {history}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Header item={item} />
      {needs}
      {where}
      {units}
      <Details item={item} />
      {history}
    </div>
  );
}

/** Name first, then the count for each place it's in, then the photos (DEC-031, DEC-047). */
function Header({ item }: { item: ItemDetail }) {
  const stocked = item.places.filter((p) => p.hasStock);
  return (
    <div className="flex flex-col gap-3">
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
      {/* The count sits above the photos so it's in reach on a phone without scrolling. */}
      {stocked.map((p) => (
        <div key={p.locationId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border px-3 py-2" data-count-row>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted">In </span>
            {p.path.at(-1)?.name}
            {p.out && <span className="text-muted"> (bin out)</span>}
          </span>
          <StockControl itemId={item.id} locationId={p.locationId} placeName={p.path.at(-1)?.name ?? ""} tracking={item.tracking} qty={p.qty} level={p.level} stale={p.stale} compact />
        </div>
      ))}
      <PartPhotos item={item} />
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
        <WhereBlock path={place.path} out={place.out} className="flex-1" />
        <button
          onClick={() => toggleHome.mutate()}
          aria-pressed={place.isHome}
          className={`flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] ${place.isHome ? "text-ok" : "text-muted"}`}
          title="Home = where it belongs. Used by put-back."
        >
          <House size={16} /> {place.isHome ? "Home" : "Make home"}
        </button>
      </div>
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
    <PickLocation title={`Move from ${place.path.at(-1)?.name}: scan where it's going`} onPick={(l) => move.mutate(l)} onCancel={done} near={place.path}>
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
  return <PickLocation title="Scan the bin or box it's also in" onPick={(l) => add.mutate(l)} onCancel={done} near={item.places[0]?.path} />;
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

/** Take a stickered unit out: scan where it's going (bench, project), or just note who has it. */
function CheckOutUnit({ unitId, code, done }: { unitId: number; code: string | null; done: () => void }) {
  const handlers = useStockMutation();
  const [note, setNote] = useState("");
  const out = useMutation({
    mutationFn: (to: { id: number; name: string } | null) =>
      api<StockResult>(`/units/${unitId}/checkout`, { method: "POST", body: { toLocationId: to?.id ?? null, note: note.trim() || null } }),
    ...handlers((_, to: { name: string } | null) => `Checked out${to ? ` to ${to.name}` : ""}`),
    onSettled: done,
  });
  return (
    <PickLocation title={`Check out ${code ?? "unit"}: scan where it's going`} onPick={(l) => out.mutate(l)} onCancel={done}>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. lent to Sam"
          aria-label="Note"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <Button onClick={() => out.mutate(null)} disabled={!note.trim()} title="Out with just the note, no location">
          Just mark out
        </Button>
      </div>
    </PickLocation>
  );
}

/**
 * The category's per-unit fields on one stickered unit (DEC-062): a battery's charge level, say.
 * Each saves as it's changed; a detail, not a stock change, so no toast and no Undo.
 */
function UnitFields({ item, unit }: { item: ItemDetail; unit: Unit }) {
  const qc = useQueryClient();
  const fields = item.fieldDefs.filter((f) => f.perUnit);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (attributes: Record<string, string>) => api<ItemDetail>(`/units/${unit.id}`, { method: "PATCH", body: { attributes } }),
    onSuccess: (detail) => {
      qc.setQueryData(["item", item.id], detail);
      qc.invalidateQueries({ queryKey: ["items"] });
      setDraft({});
    },
  });
  if (fields.length === 0) return null;
  const who = unit.code ?? `unit ${unit.id}`;
  const set = (key: string, value: string) => save.mutate({ ...unit.attributes, [key]: value });
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {fields.map((f) => {
        const value = draft[f.key] ?? unit.attributes[f.key] ?? "";
        return (
          <label key={f.key} className="flex items-center gap-1.5 text-[13px] text-muted">
            {f.label}
            {f.type === "choice" ? (
              <select value={value} onChange={(e) => set(f.key, e.target.value)} className={`${inputClass} min-h-9 py-0 text-sm text-text`} aria-label={`${f.label} of ${who}`}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
                {value && !(f.options ?? []).includes(value) && <option value={value}>{value} (not in the list)</option>}
              </select>
            ) : (
              <input
                value={value}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => {
                  if (draft[f.key] !== undefined && draft[f.key] !== (unit.attributes[f.key] ?? "")) set(f.key, draft[f.key]!);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={`${inputClass} min-h-9 w-32 py-0 text-sm text-text`}
                aria-label={`${f.label} of ${who}`}
              />
            )}
          </label>
        );
      })}
    </span>
  );
}

export function UnitCheckIn({ unitId }: { unitId: number }) {
  const handlers = useStockMutation();
  const back = useMutation({
    mutationFn: () => api<StockResult>(`/units/${unitId}/checkin`, { method: "POST", body: {} }),
    ...handlers(() => "Checked back in"),
  });
  return (
    <Button variant="ghost" onClick={() => back.mutate()} disabled={back.isPending}>
      <LogIn size={18} /> Check in
    </Button>
  );
}

function AddUnit({ item, done }: { item: ItemDetail; done: () => void }) {
  const handlers = useStockMutation();
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
  return <ScanTarget what="Scan the new sticker on it" camera={{ tap: true, title: "The new sticker" }} actions={<Button variant="ghost" onClick={done}>Cancel</Button>} />;
}

function Details({ item }: { item: ItemDetail }) {
  const labels = new Map(item.fieldDefs.map((f) => [f.key, f.label]));
  // A detail the AI filled in wears a small mark with where it came from (DEC-048).
  const ai = item.aiFields ?? {};
  const mark = (field: string, node: React.ReactNode) => {
    const fill = ai[field];
    if (!fill) return node;
    const from = fill.source === "photo" ? "the photo" : (() => { try { return new URL(fill.source).hostname.replace(/^www\./, ""); } catch { return fill.source; } })();
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {node}
        <span className="inline-flex items-center gap-0.5 rounded-full border border-accent/50 px-1.5 text-[11px] text-accent" title={`Filled in by AI from ${from}`} data-ai-mark={field}>
          <Sparkles size={10} /> AI
        </span>
      </span>
    );
  };
  const rows: [string, React.ReactNode][] = [
    ...Object.entries(item.attributes).map(([k, v]) => [labels.get(k) ?? k, mark(`attributes.${k}`, v)] as [string, React.ReactNode]),
    ...(item.price !== null ? [["Price", mark("price", `$${item.price.toFixed(2)}`)] as [string, React.ReactNode]] : []),
    ...(item.supplier ? [["Supplier", mark("supplier", item.supplier)] as [string, React.ReactNode]] : []),
    ...(item.supplierPn ? [["Supplier part #", mark("supplierPn", <span className="font-mono">{item.supplierPn}</span>)] as [string, React.ReactNode]] : []),
  ];
  const aiSources = [...new Set(Object.values(ai).map((f) => f.source))];
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
          mark("url", (
            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent">
              <ExternalLink size={16} /> Product link
            </a>
          ))
        )}
        {item.notes && <p className="whitespace-pre-wrap text-sm">{item.notes}</p>}
        {aiSources.length > 0 && (
          <p className="text-[12px] text-muted" data-ai-note>
            <Sparkles size={11} className="mr-1 inline text-accent" aria-hidden />
            Details marked AI were filled in by AI from{" "}
            {aiSources.map((src, i) => (
              <span key={src}>
                {i > 0 && ", "}
                {src === "photo" ? "the photo" : <a href={src} target="_blank" rel="noreferrer" className="text-accent">{(() => { try { return new URL(src).hostname.replace(/^www\./, ""); } catch { return src; } })()}</a>}
              </span>
            ))}
            . Check them against the part.
          </p>
        )}
      </Card>
    </section>
  );
}
