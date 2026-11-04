import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Camera, ChevronRight, House, ScanLine, Search, X } from "lucide-react";
import type { ItemDetail, ItemSummary, LocationDetail, ScanResult, StockResult } from "../../shared/api";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { StockControl } from "../components/StockControl";
import { useToast } from "../components/Toast";
import { Button, Card, inputClass, itemName, pathText, PlacePath, Thumb } from "../components/ui";

type Loc = { id: number; name: string };
type Step =
  | { kind: "ready" }
  | { kind: "placed"; itemId: number; location: Loc }
  | { kind: "choose"; location: LocationDetail }
  | { kind: "where"; item: ItemDetail; unitId?: number }
  | { kind: "notHome"; item: ItemDetail; unitId?: number; location: Loc }
  | { kind: "empty"; location: LocationDetail };

/** Where an item (or one stickered unit of it) belongs. */
function homesOf(item: ItemDetail, unitId?: number): Loc[] {
  const homes = item.places.filter((p) => p.isHome).map((p) => ({ id: p.locationId, name: p.path.at(-1)?.name ?? "" }));
  // A stickered unit has its own home (e.g. which shelf this particular power supply lives on).
  const unitHome = item.unitList.find((u) => u.id === unitId)?.homeLocationId;
  if (unitHome) return [homes.find((h) => h.id === unitHome) ?? { id: unitHome, name: "its home" }];
  return homes;
}

/**
 * Put-back mode (F6). Every scan means "this is going back":
 * a one-part bin logs +1, a mixed bin asks which part, an item's own sticker asks which bin.
 */
export function PutBackPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { openCamera } = useScan();
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [count, setCount] = useState(0);

  const put = useMutation({
    mutationFn: (v: { itemId: number; location: Loc; unitId?: number }) =>
      api<StockResult>("/putback", { method: "POST", body: { itemId: v.itemId, locationId: v.location.id, unitId: v.unitId } }),
    onSuccess: (r, v) => {
      qc.setQueryData(["item", r.item.id], r.item);
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      setCount((n) => n + 1);
      setStep({ kind: "placed", itemId: r.item.id, location: v.location });
      toast.show({ message: `${itemName(r.item.name)} → ${v.location.name}`, undoEventId: r.eventId });
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  const placeAt = (item: ItemDetail, location: Loc, unitId?: number) => {
    const homes = homesOf(item, unitId);
    if (homes.length > 0 && !homes.some((h) => h.id === location.id)) setStep({ kind: "notHome", item, unitId, location });
    else put.mutate({ itemId: item.id, location, unitId });
  };

  const startItem = async (itemId: number, unitId?: number) => {
    const item = await api<ItemDetail>(`/items/${itemId}`);
    const homes = homesOf(item, unitId);
    const unit = item.unitList.find((u) => u.id === unitId);
    if (unit && homes.length === 1 && unit.locationId === homes[0]!.id) {
      toast.show({ message: `${itemName(item.name)} is already in ${homes[0]!.name}` });
      return;
    }
    setStep({ kind: "where", item, unitId });
  };

  useScanHandler((code) => {
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unassigned") return navigate(`/capture?code=${encodeURIComponent(r.code)}`);
        if (r.kind === "unit") return startItem(r.itemId, r.unitId);
        const loc = r.location;
        // An item is waiting for its bin: this scan is the bin.
        if (step.kind === "where" || step.kind === "notHome") return placeAt(step.item, loc, step.unitId);
        const stocked = loc.items.filter((i) => i.hasStock);
        if (loc.items.length === 0) setStep({ kind: "empty", location: loc });
        else if (loc.items.length === 1 && stocked.length === 1) put.mutate({ itemId: stocked[0]!.itemId, location: loc });
        else setStep({ kind: "choose", location: loc });
      })
      .catch((e: Error) => toast.show({ message: e.message, tone: "error" }));
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Archive size={22} className="text-accent" />
        <h1 className="flex-1 text-xl font-semibold">Put-back mode</h1>
        {count > 0 && <span className="text-sm text-muted">{count} put back</span>}
      </div>

      {/* Desktop / Pi: the current step beside "find it". */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {step.kind === "ready" && (
            <Card className="flex flex-col items-center gap-3 p-6 text-center">
              <ScanLine size={40} className="text-accent" />
              <p className="font-semibold">Scan whatever you're putting away</p>
              <p className="text-sm text-muted">
                Emptying your put-back bin? Scan the bin each thing goes into to add it back, or scan the item's own sticker to see where it lives.
              </p>
              <Button variant="primary" onClick={openCamera} className="min-h-14 w-full text-lg">
                <Camera size={22} /> Scan with camera
              </Button>
            </Card>
          )}

          {step.kind === "placed" && <Placed itemId={step.itemId} location={step.location} onNext={openCamera} />}


          {step.kind === "choose" && (
            <Card className="flex flex-col gap-3 p-4">
              <p className="font-semibold">Which one goes back in {step.location.name}?</p>
              <ul className="flex flex-col gap-2">
                {step.location.items.map((i) => (
                  <li key={i.itemId}>
                    <button
                      onClick={() =>
                        i.hasStock ? put.mutate({ itemId: i.itemId, location: step.location }) : startItem(i.itemId)
                      }
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 text-left"
                    >
                      <Thumb url={i.thumbUrl} size={44} />
                      <span className={`flex-1 ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
                      <span className="text-sm text-accent">+1</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" onClick={() => setStep({ kind: "ready" })} className="self-start">Cancel</Button>
            </Card>
          )}

          {step.kind === "where" && (
            <Card className="flex flex-col gap-3 border-accent/50 p-4">
              <ItemHeader item={step.item} />
              {homesOf(step.item, step.unitId).length > 0 ? (
                <>
                  <p className="text-sm text-muted">Goes back in:</p>
                  {homesOf(step.item, step.unitId).map((h) => (
                    <Button key={h.id} variant="primary" className="min-h-14 text-lg" onClick={() => put.mutate({ itemId: step.item.id, location: h, unitId: step.unitId })}>
                      <House size={20} /> {pathText(step.item.places.find((p) => p.locationId === h.id)?.path ?? [h])}
                    </Button>
                  ))}
                  <p className="text-center text-sm text-muted">…or scan the bin you're putting it in</p>
                </>
              ) : (
                <p className="flex items-center gap-2 font-semibold"><ScanLine size={20} className="text-accent" /> No home yet. Scan the bin it's going in</p>
              )}
              <div className="flex gap-2">
                <Button onClick={openCamera}>Scan with camera</Button>
                <Button variant="ghost" onClick={() => setStep({ kind: "ready" })}>Cancel</Button>
              </div>
            </Card>
          )}

          {step.kind === "notHome" && (
            <Card className="flex flex-col gap-3 border-warn/50 p-4">
              <ItemHeader item={step.item} />
              <p className="flex items-start gap-2 text-warn">
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                {step.location.name} isn't its usual home ({homesOf(step.item, step.unitId).map((h) => h.name).join(", ")}).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => put.mutate({ itemId: step.item.id, location: step.location, unitId: step.unitId })}>
                  Put it here anyway
                </Button>
                <Button onClick={() => setStep({ kind: "where", item: step.item, unitId: step.unitId })}>Show its home</Button>
              </div>
            </Card>
          )}

          {step.kind === "empty" && (
            <Card className="flex flex-col gap-3 p-4">
              <p className="font-semibold">Nothing recorded in {step.location.name} yet.</p>
              <Link to={`/capture?location=${step.location.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg">
                <Camera size={20} /> Quick capture into {step.location.name}
              </Link>
              <Button variant="ghost" onClick={() => setStep({ kind: "ready" })} className="self-start">Cancel</Button>
            </Card>
          )}
        </div>
        {(step.kind === "ready" || step.kind === "placed") && <FindPart onPick={(id) => startItem(id)} />}
      </div>
    </div>
  );
}

function ItemHeader({ item }: { item: ItemDetail }) {
  return (
    <div className="flex items-center gap-3">
      <Thumb url={item.thumbUrl} size={56} />
      <span className={`flex-1 font-semibold ${item.name ? "" : "italic text-muted"}`}>{itemName(item.name)}</span>
    </div>
  );
}

/** After a put-back: what happened, with +/− to adjust the amount. */
function Placed({ itemId, location, onNext }: { itemId: number; location: Loc; onNext: () => void }) {
  const { data: item } = useQuery({ queryKey: ["item", itemId], queryFn: () => api<ItemDetail>(`/items/${itemId}`) });
  if (!item) return null;
  const place = item.places.find((p) => p.locationId === location.id);
  return (
    <Card className="flex flex-col gap-3 border-ok/50 p-4">
      <ItemHeader item={item} />
      <p className="text-sm text-ok">Back in {place ? pathText(place.path) : location.name}</p>
      {place?.hasStock && (
        <StockControl itemId={item.id} locationId={location.id} placeName={location.name} tracking={item.tracking} qty={place.qty} level={place.level} stale={place.stale} />
      )}
      <Button variant="primary" onClick={onNext} className="min-h-14 text-lg">
        <Camera size={22} /> Scan the next one
      </Button>
    </Card>
  );
}

/**
 * No sticker and not sure where it lives? Search by what it is, and match it by photo.
 * Before typing, shows parts you took some of lately: leftovers are usually among them.
 */
function FindPart({ onPick }: { onPick: (itemId: number) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const { data: results } = useQuery({
    queryKey: ["items", { q }],
    queryFn: () => api<ItemSummary[]>(`/items?q=${encodeURIComponent(q)}`),
    enabled: q !== "",
    placeholderData: keepPreviousData,
  });
  const { data: recent } = useQuery({
    queryKey: ["items", "recently-used"],
    queryFn: () => api<ItemSummary[]>("/items/recently-used"),
  });
  const list = q ? results : recent;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">No sticker? Find it</h2>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          enterKeyHint="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What is it? e.g. cap 100uF"
          aria-label="Search for the part"
          autoCapitalize="none"
          autoCorrect="off"
          className={`${inputClass} w-full pl-10 pr-10`}
        />
        {text && (
          <button onClick={() => setText("")} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted">
            <X size={18} />
          </button>
        )}
      </div>
      {!q && recent && recent.length > 0 && <p className="text-[13px] text-muted">Recently taken out:</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {list.map((i) => {
            const home = i.places.find((p) => p.isHome) ?? i.places[0];
            return (
              <li key={i.id}>
                <button onClick={() => onPick(i.id)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2">
                  <Thumb url={i.thumbUrl} size={52} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
                    {home ? (
                      <PlacePath path={home.path} className="text-[13px] text-muted" after={i.places.length > 1 && ` · +${i.places.length - 1}`} />
                    ) : (
                      <span className="block truncate text-[13px] text-muted">No home yet</span>
                    )}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q && results && results.length === 0 && (
        <p className="px-1 py-3 text-center text-sm text-muted">
          Nothing matches “{q}”. If it's new, <Link to="/capture" className="text-accent">quick capture it</Link>.
        </p>
      )}
    </section>
  );
}
