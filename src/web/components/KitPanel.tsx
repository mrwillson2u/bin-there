import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, House, Package, PackagePlus, ScanLine, Search, Undo2, X } from "lucide-react";
import { levelLabels, type ItemDetail, type ItemSummary, type LocationDetail, type LocationItem, type PinnedLocation, type ReturnResult, type ScanResult, type StockResult } from "../../shared/api";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { StockControl, useStockMutation } from "./StockControl";
import { useToast } from "./Toast";
import { Badge, BinChip, Button, Card, inputClass, itemName, pathText, PlacePath, Thumb } from "./ui";
import { contents } from "./LocationList";
import { usePutBackBin, useTakeOutBin } from "./TakeOut";

// A project kit (J4, DEC-019): parts pulled together for one project. Each part keeps
// its home, so "Return everything" sends it all back, and "Finish" does that and
// deletes the kit. Scanning here pulls things in: a part's own sticker checks it out
// to the kit; a bin's sticker offers the whole bin (it keeps its spot in its box,
// DEC-028) or lists what's in it to pull from.

type Pick = { itemId: number; name: string; thumbUrl: string | null };

export function KitPanel({ kit, scanActive }: { kit: LocationDetail; scanActive: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const handlers = useStockMutation();
  const [pulling, setPulling] = useState(false);
  const [fromBin, setFromBin] = useState<LocationDetail | null>(null);
  const [left, setLeft] = useState<ReturnResult["left"] | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["item"] });
  };

  const giveBack = useMutation({
    mutationFn: (body: { itemId?: number; finish?: boolean }) => api<ReturnResult>(`/projects/${kit.id}/return`, { method: "POST", body }),
    onSuccess: (r, body) => {
      setLeft(r.left.length ? r.left : null);
      if (r.finished) {
        // Leave first and drop the kit's own query, so nothing refetches the deleted kit.
        qc.removeQueries({ queryKey: ["location", kit.id] });
        navigate("/locations", { replace: true });
        toast.show({ message: `${kit.name} finished: ${r.returned} thing${r.returned === 1 ? "" : "s"} put back home` });
      }
      refresh();
      if (r.finished) return;
      if (body.itemId) {
        toast.show({ message: r.returned ? "Back home" : (r.left[0]?.reason ?? "Nothing to return") });
      } else {
        toast.show({ message: `${r.returned} thing${r.returned === 1 ? "" : "s"} put back home${r.left.length ? `, ${r.left.length} left` : ""}` });
      }
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  // Checking a unit out to the kit when its sticker is scanned.
  const pullUnit = useMutation({
    mutationFn: (unitId: number) => api<StockResult>(`/units/${unitId}/checkout`, { method: "POST", body: { toLocationId: kit.id } }),
    ...handlers(() => `Checked out to ${kit.name}`),
  });

  useScanHandler((code) => {
    if (!scanActive) return false;
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unit") pullUnit.mutate(r.unitId);
        else if (r.kind === "location") {
          if (r.location.id === kit.id) return;
          setFromBin(r.location);
          setPulling(true);
        } else navigate(`/capture?code=${encodeURIComponent(r.code)}&location=${kit.id}`);
      })
      .catch((e: Error) => toast.show({ message: e.message, tone: "error" }));
    return true;
  });

  const hasStuff = kit.items.length > 0 || kit.outHere.length > 0;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="flex flex-col gap-3">
        {scanActive && !pulling && <ScanTarget compact what="Scan a part or a bin to pull it into the kit" />}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => { setFromBin(null); setPulling(true); }}>
            <PackagePlus size={18} /> Pull in a part
          </Button>
          {hasStuff && (
            <Button onClick={() => giveBack.mutate({})} disabled={giveBack.isPending}>
              <Undo2 size={18} /> Return everything
            </Button>
          )}
          <Button
            onClick={() => {
              const msg = hasStuff
                ? `Finish ${kit.name}? Everything still in it goes back home, then the kit is deleted.`
                : `Finish ${kit.name}? The empty kit is deleted.`;
              if (window.confirm(msg)) giveBack.mutate({ finish: true });
            }}
            disabled={giveBack.isPending}
          >
            <CheckCircle2 size={18} /> Finish project
          </Button>
        </div>
        <p className="text-[13px] text-muted">
          Scan a part's sticker to check it out here, or a bin's sticker to take the whole bin or pull a part from it. Use − on what the project used up; the rest goes home when you finish.
        </p>

        {left && (
          <Card className="flex flex-col gap-1 border-warn/40 bg-warn/10 p-4 text-sm">
            <p className="font-semibold text-warn">Still in the kit:</p>
            {left.map((l) => (
              <p key={l.itemId}>
                <Link to={`/items/${l.itemId}`} className="text-accent">{itemName(l.name)}</Link> · {l.reason}. Open it and pick a home, or move it by hand.
              </p>
            ))}
          </Card>
        )}

        {pulling && <PullPanel kit={kit} fromBin={fromBin} onClose={() => { setPulling(false); setFromBin(null); }} />}
      </section>

      <div className="flex flex-col gap-4">
        {kit.outHere.length > 0 && <KitBins bins={kit.outHere} />}
        {(kit.items.length > 0 || kit.outHere.length === 0) && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">In the kit</h2>
            {kit.items.length === 0 ? (
              <p className="px-1 py-3 text-center text-muted">Nothing in it yet.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {kit.items.map((i) => (
                  <KitRow key={i.itemId} kit={kit} item={i} onReturn={() => giveBack.mutate({ itemId: i.itemId })} busy={giveBack.isPending} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Whole bins taken out of their boxes to this kit (DEC-028); each goes back to its saved spot. */
function KitBins({ bins }: { bins: PinnedLocation[] }) {
  const putBack = usePutBackBin();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Bins taken out to this kit</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {bins.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
            <Link to={`/locations/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              {b.binSize && <BinChip size={b.binSize} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{b.name}</span>
                <span className="block truncate text-[13px] text-muted">{contents(b)}</span>
                <PlacePath path={b.path.slice(0, -1)} className="items-center text-[13px] text-muted" before={<House size={13} className="mr-1" aria-label="From" />} />
              </span>
            </Link>
            <Button variant="ghost" className="shrink-0 px-2" onClick={() => putBack.mutate(b.id)} disabled={putBack.isPending} aria-label={`Put ${b.name} back`}>
              <Undo2 size={18} /> Put back
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KitRow({ kit, item: i, onReturn, busy }: { kit: LocationDetail; item: LocationItem; onReturn: () => void; busy: boolean }) {
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Link to={`/items/${i.itemId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb url={i.thumbUrl} size={44} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
            {i.homePath.length ? (
              <PlacePath
                path={i.homePath}
                className="items-center text-[13px] text-muted"
                before={<House size={13} className="mr-1" />}
                after={i.units > 0 && <span className="ml-1.5"><Badge tone="info">{i.units} stickered</Badge></span>}
              />
            ) : (
              <span className="block truncate text-[13px] text-warn">
                <House size={13} className="mr-1 inline align-[-2px]" />
                no home yet
                {i.units > 0 && <span className="ml-1.5"><Badge tone="info">{i.units} stickered</Badge></span>}
              </span>
            )}
          </span>
        </Link>
        <Button variant="ghost" className="shrink-0 px-2" onClick={onReturn} disabled={busy || !i.homePath.length} aria-label={`Return ${itemName(i.name)} home`}>
          <Undo2 size={18} /> Return
        </Button>
      </div>
      {i.hasStock && (
        <StockControl compact itemId={i.itemId} locationId={kit.id} placeName={kit.name} tracking={i.tracking} qty={i.qty} level={i.level} />
      )}
    </li>
  );
}

/** Find a part (search, or the contents of a scanned bin), then pull some of it into the kit. */
function PullPanel({ kit, fromBin, onClose }: { kit: LocationDetail; fromBin: LocationDetail | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Pick | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 200);
    return () => clearTimeout(t);
  }, [text]);
  const { data: found } = useQuery({
    queryKey: ["items", { q, pull: true }],
    queryFn: () => api<ItemSummary[]>(`/items?q=${encodeURIComponent(q)}`),
    enabled: !fromBin && q.length > 0,
    placeholderData: keepPreviousData,
  });
  const choices: Pick[] = fromBin
    ? fromBin.items.map((i) => ({ itemId: i.itemId, name: i.name, thumbUrl: i.thumbUrl }))
    : (found ?? []).filter((i) => i.places.some((p) => p.locationId !== kit.id)).map((i) => ({ itemId: i.id, name: i.name, thumbUrl: i.thumbUrl }));

  return (
    <Card className="flex flex-col gap-3 border-accent/50 p-4">
      <div className="flex items-center gap-2">
        <p className="flex flex-1 items-center gap-2 font-semibold">
          <ScanLine size={20} className="text-accent" />
          {fromBin ? (fromBin.type === "bin" ? fromBin.name : `Pull from ${fromBin.name}`) : "Pull in a part: scan it, or search"}
        </p>
        <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-muted"><X size={18} /></button>
      </div>
      {picked ? (
        <PullFrom kit={kit} pick={picked} onBack={() => setPicked(null)} onDone={onClose} />
      ) : (
        <>
          {fromBin?.type === "bin" && <WholeBin kit={kit} bin={fromBin} onDone={onClose} />}
          {fromBin?.type === "bin" && choices.length > 0 && !(fromBin.out?.to?.id === kit.id) && <p className="text-[13px] text-muted">Or pull one part from it:</p>}
          {!fromBin && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Search parts"
                  aria-label="Search parts to pull in"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`${inputClass} w-full pl-10`}
                />
              </div>
            </div>
          )}
          {!fromBin && !picked && <ScanTarget compact what="Scan the part, or the bin it's in" />}
          {choices.length > 0 && (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {choices.map((c) => (
                <li key={c.itemId}>
                  <button onClick={() => setPicked(c)} className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left">
                    <Thumb url={c.thumbUrl} size={36} />
                    <span className={`truncate ${c.name ? "" : "italic text-muted"}`}>{itemName(c.name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fromBin && choices.length === 0 && <p className="text-sm text-muted">Nothing in {fromBin.name}.</p>}
          {!fromBin && q && found && choices.length === 0 && <p className="text-sm text-muted">Nothing matches “{q}”.</p>}
        </>
      )}
    </Card>
  );
}

/**
 * A bin scanned on the kit's screen (DEC-028): take the whole bin to the kit. It stays its
 * box's and keeps its spot there. Says so plainly if it's already here or out somewhere else.
 */
function WholeBin({ kit, bin, onDone }: { kit: LocationDetail; bin: LocationDetail; onDone: () => void }) {
  const takeOut = useTakeOutBin(bin.id, onDone);
  const box = bin.path.at(-2)?.name ?? "its box";
  if (bin.out?.to?.id === kit.id) return <p className="text-sm text-muted">{bin.name} is already in this kit.</p>;
  if (bin.out) return <p className="text-sm text-muted">{bin.name} is out already{bin.out.to ? `, in ${bin.out.to.name}` : `: ${bin.out.note ?? ""}`}.</p>;
  return (
    <div className="flex flex-col gap-1">
      <Button variant="primary" className="self-start" onClick={() => takeOut.mutate({ toLocationId: kit.id })} disabled={takeOut.isPending}>
        <Package size={18} /> Take the whole bin
      </Button>
      <p className="text-[13px] text-muted">Its spot in {box} stays saved until it's back.</p>
      {takeOut.error && <p className="text-sm text-danger" role="alert">{(takeOut.error as Error).message}</p>}
    </div>
  );
}

/** The chosen part's places: pull a count (or all) from one, or check a stickered unit out. */
function PullFrom({ kit, pick, onBack, onDone }: { kit: LocationDetail; pick: Pick; onBack: () => void; onDone: () => void }) {
  const { data: item } = useQuery({ queryKey: ["item", pick.itemId], queryFn: () => api<ItemDetail>(`/items/${pick.itemId}`) });
  const handlers = useStockMutation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const pull = useMutation({
    mutationFn: (v: { from: number; qty?: number }) =>
      api<StockResult>("/stock/move", { method: "POST", body: { itemId: pick.itemId, fromLocationId: v.from, toLocationId: kit.id, qty: v.qty } }),
    ...handlers((r) => `${itemName(r.item.name)} → ${kit.name}`),
    onSettled: onDone,
  });
  // Level items don't move by count: just note that some are in the kit now.
  const note = useMutation({
    mutationFn: () => api<StockResult>("/stock/recount", { method: "POST", body: { itemId: pick.itemId, locationId: kit.id, level: "plenty" } }),
    ...handlers((r) => `${itemName(r.item.name)} noted in ${kit.name}`),
    onSettled: onDone,
  });
  const out = useMutation({
    mutationFn: (unitId: number) => api<StockResult>(`/units/${unitId}/checkout`, { method: "POST", body: { toLocationId: kit.id } }),
    ...handlers((r) => `${itemName(r.item.name)} checked out to ${kit.name}`),
    onSettled: onDone,
  });
  if (!item) return <p className="text-muted">Loading…</p>;
  const places = item.places.filter((p) => p.hasStock && p.locationId !== kit.id);
  const units = item.unitList.filter((u) => !u.out && u.locationId !== kit.id);
  const busy = pull.isPending || note.isPending || out.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Thumb url={pick.thumbUrl} size={36} />
        <span className="flex-1 font-semibold">{itemName(pick.name)}</span>
        <button onClick={onBack} className="min-h-11 px-2 text-sm text-accent">Back</button>
      </div>
      {item.tracking === "level" ? (
        <Button variant="primary" onClick={() => note.mutate()} disabled={busy}>Some are in the kit now</Button>
      ) : (
        places.map((p) => (
          <div key={p.locationId} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
            <PlacePath path={p.path} className="flex-1 text-sm" after={<> · <span className="font-mono">{p.qty ?? "?"}</span></>} />
            {p.qty !== null && p.qty > 1 && (
              <input
                inputMode="numeric"
                aria-label={`How many from ${p.path.at(-1)?.name}`}
                value={qty[p.locationId] ?? ""}
                onChange={(e) => setQty((s) => ({ ...s, [p.locationId]: e.target.value.replace(/\D/g, "") }))}
                placeholder={`all ${p.qty}`}
                className={`${inputClass} w-24 text-center font-mono`}
              />
            )}
            <Button variant="primary" disabled={busy || p.qty === null} onClick={() => pull.mutate({ from: p.locationId, qty: qty[p.locationId] ? Number(qty[p.locationId]) : undefined })}>
              Pull
            </Button>
          </div>
        ))
      )}
      {item.tracking === "level" && places.length > 0 && (
        <p className="text-[13px] text-muted">{places.map((p) => `${pathText(p.path)}: ${p.level ? levelLabels[p.level] : "?"}`).join(" · ")}</p>
      )}
      {units.map((u) => (
        <div key={u.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-mono">{u.code ?? "no sticker"}</span>
            {u.path.length > 0 && ` · ${pathText(u.path)}`}
          </span>
          <Button variant="primary" disabled={busy} onClick={() => out.mutate(u.id)}>Check out</Button>
        </div>
      ))}
      {item.tracking === "exact" && places.length === 0 && units.length === 0 && (
        <p className="text-sm text-muted">Nothing counted anywhere to pull from.</p>
      )}
    </div>
  );
}
