import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, LogOut, MoveRight, Pencil, Plus, QrCode, ScanLine, Trash2 } from "lucide-react";
import { holdsPositions, locationTypeLabels, type BinSize, type LocationDetail, type LocationSummary, type LocationType, tileViews, type TileView } from "../../shared/api";
import type { Slot } from "../../shared/grid";
import { api } from "../api";
import { useWide } from "../lib/useWide";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { LocationList } from "../components/LocationList";
import { BoxGrid } from "../components/BoxGrid";
import { BinSheet, OnePart } from "../components/BinSheet";
import { StickersView } from "../components/StickersView";
import { primeFeedback } from "../scan/feedback";
import { useToast } from "../components/Toast";
import { KitPanel } from "../components/KitPanel";
import { LocationItemList } from "../components/ItemList";
import { PickLocation } from "../components/PickLocation";
import { OutBanner, TakeOutForm } from "../components/TakeOut";
import { RackSetup, RackView } from "../components/RackView";
import { PinButton } from "../components/PinButton";
import { BinChip, Breadcrumbs, Button, Card, inputClass, PositionTag } from "../components/ui";
import { WhereBlock } from "../components/WhereMap";

type Mode = "idle" | "assign" | "move" | "takeout";

/** Sites and racks mostly hold other locations; everything else mostly holds parts. */
const holdsPlaces = (t: LocationType) => t === "site" || t === "rack";

const sectionTitle = "text-[13px] font-semibold uppercase tracking-wide text-muted";

// A location's own page (DEC-024): what's in it first, then the things you do to the
// location itself (its sticker, moving it, deleting it) at the bottom. A section that
// would only say "nothing here" is left out unless filling it is what this kind of
// place is for; its add button moves down with the others.

export function LocationPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wide = useWide();
  const { data: loc, error } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api<LocationDetail>(`/locations/${id}`),
  });
  const [mode, setMode] = useState<Mode>("idle");
  /** A problem with the sticker, a move or a delete; shown by those buttons. */
  const [message, setMessage] = useState<string | null>(null);
  /** A problem placing a bin; shown under the grid. */
  const [gridMessage, setGridMessage] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const [openBin, setOpenBin] = useState<LocationSummary | null>(null);
  // Opened from a part's directions (DEC-038): that bin is outlined on the grid until one is tapped.
  const [params] = useSearchParams();
  const markedId = Number(params.get("bin")) || null;
  // Sticker mode: the full-screen camera + grid for labelling bins (DEC-022).
  const [labelling, setLabelling] = useState(false);
  const [edit, setEdit] = useState<{ name: string } | null>(null);
  const toast = useToast();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["pins"] });
  };
  const done = (msg: string) => {
    setMode("idle");
    setMessage(null);
    toast.show({ message: msg });
    refresh();
  };
  const fail = (e: Error) => setMessage(e.message);

  const assign = useMutation({
    mutationFn: (code: string) => api<LocationDetail>(`/locations/${id}/code`, { method: "POST", body: { code } }),
    onSuccess: (l) => done(`Sticker assigned to ${l.name}`),
    onError: fail,
  });
  const move = useMutation({
    mutationFn: (parentId: number) =>
      api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: { parentId } }),
    onSuccess: (l) => done(`Moved to ${l.path.at(-2)?.name ?? "?"}`),
    onError: fail,
  });
  const rename = useMutation({
    mutationFn: (body: { name: string }) => api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body }),
    onSuccess: (l) => {
      setEdit(null);
      toast.show({ message: `Renamed to ${l.name}` });
      refresh();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  // Placing a bin on the box's grid. The grid updates at once and is put back if the server says no.
  const place = useMutation({
    mutationFn: ({ bin, slot }: { bin: LocationSummary; slot: Slot | null }) =>
      api<LocationDetail>(`/locations/${bin.id}/slot`, { method: "PUT", body: slot }),
    onMutate: async ({ bin, slot }) => {
      await qc.cancelQueries({ queryKey: ["location", id] });
      const before = qc.getQueryData<LocationDetail>(["location", id]);
      if (before) {
        qc.setQueryData<LocationDetail>(["location", id], {
          ...before,
          children: before.children.map((c) => (c.id === bin.id ? { ...c, slot } : c)),
        });
      }
      return { before };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.before) qc.setQueryData(["location", id], ctx.before);
      setGridMessage(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["location", id] });
    },
  });

  // Photos or names on this box's tiles (DEC-036); the grid changes at once.
  const tileView = useMutation({
    mutationFn: (v: TileView) => api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: { tileView: v } }),
    onMutate: (v) => {
      const before = qc.getQueryData<LocationDetail>(["location", id]);
      if (before) qc.setQueryData<LocationDetail>(["location", id], { ...before, tileView: v });
      return { before };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(["location", id], ctx.before);
      toast.show({ message: e.message, tone: "error" });
    },
  });

  // A new bin dragged from the palette onto the grid (DEC-020): numbered, placed, done.
  const addBin = useMutation({
    mutationFn: ({ binSize, slot }: { binSize: BinSize; slot: Slot }) =>
      api<LocationDetail>("/locations", { method: "POST", body: { type: "bin", parentId: id, binSize, slot } }),
    onSuccess: (bin) => {
      toast.show({ message: `${bin.name} added` });
      qc.invalidateQueries({ queryKey: ["location", id] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e: Error) => setGridMessage(e.message),
  });

  // Only an empty location can be deleted (soft delete: hidden, history kept).
  const remove = useMutation({
    mutationFn: () => api<{ parentId: number | null }>(`/locations/${id}`, { method: "DELETE" }),
    onSuccess: ({ parentId }) => {
      navigate(parentId ? `/locations/${parentId}` : "/locations", { replace: true });
      // Refresh everything but the deleted place (its page is still closing and would ask for it),
      // then drop it, so Back to it says it's gone instead of showing it.
      qc.invalidateQueries({ predicate: (q) => !(q.queryKey[0] === "location" && q.queryKey[1] === id) });
      setTimeout(() => qc.removeQueries({ queryKey: ["location", id] }), 1000);
    },
    onError: fail,
  });

  // In assign/move mode, the next scan is consumed here instead of navigating.
  useScanHandler((code) => {
    if (mode === "assign") {
      assign.mutate(code);
      return true;
    }
    // In move mode, PickLocation takes the scan.
    return false;
  });

  const { openCamera } = useScan();

  if (error) return <p className="text-danger">{(error as Error).message}</p>;
  if (!loc) return <p className="text-muted">Loading…</p>;

  const isGrid = loc.type === "gridded_box";
  const bins = loc.children.filter((c) => c.type === "bin");
  const others = isGrid ? loc.children.filter((c) => c.type !== "bin") : loc.children;
  const showItems = loc.items.length > 0 || (!isGrid && !holdsPlaces(loc.type));
  const showInside = others.length > 0 || holdsPlaces(loc.type);
  const canAddInside = loc.type !== "bin" && loc.type !== "project";
  const isEmpty = loc.children.length === 0 && loc.items.length === 0 && loc.outHere.length === 0;

  const addItem = (
    <Link to={`/capture?location=${loc.id}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-accent">
      <Plus size={18} /> Add item here
    </Link>
  );
  const addInside = (
    <Link to={`/locations/new?parent=${loc.id}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-accent">
      <Plus size={18} /> Add inside
    </Link>
  );

  const itemsSection = showItems && (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className={sectionTitle}>{isGrid ? "Loose in the box" : "Items"}</h2>
        {addItem}
      </div>
      {loc.items.length === 0 ? (
        <p className="px-1 py-3 text-center text-muted">Nothing in it yet.</p>
      ) : loc.items.length === 1 ? (
        <Card className="p-4">
          <OnePart item={loc.items[0]!} bin={loc} />
        </Card>
      ) : (
        <LocationItemList items={loc.items} />
      )}
    </section>
  );

  const insideSection = showInside && (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className={`${sectionTitle} flex-1`}>Inside</h2>
        {canAddInside && addInside}
      </div>
      {loc.rack ? (
        <RackView rack={loc} />
      ) : (
        <>
          {holdsPositions(loc.type) && <RackSetup rack={loc} />}
          <LocationList locations={others} empty="Nothing inside yet." />
        </>
      )}
    </section>
  );

  const hasBins = bins.length > 0;
  const sheetDocked = wide && openBin !== null;
  const gridSection = isGrid && (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className={sectionTitle}>Bins</h2>
        <div className="flex gap-3">
          {!arranging && hasBins && (
            <button
              type="button"
              onClick={() => { primeFeedback(); setGridMessage(null); setOpenBin(null); setLabelling(true); }}
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-accent"
            >
              <QrCode size={18} /> Stickers
            </button>
          )}
          {!labelling && (
            <button
              type="button"
              onClick={() => { setGridMessage(null); setOpenBin(null); setArranging((a) => !a); }}
              className={`inline-flex min-h-11 items-center gap-1.5 px-1 ${arranging ? "font-semibold text-accent" : "text-accent"}`}
            >
              <LayoutGrid size={18} /> {arranging ? "Done" : hasBins ? "Add or arrange bins" : "Add bins"}
            </button>
          )}
        </div>
      </div>
      {labelling && <StickersView box={loc} onExit={() => setLabelling(false)} />}
      <BoxGrid
        box={loc}
        arranging={arranging}
        selectedId={sheetDocked ? openBin.id : openBin ? null : markedId}
        onPlace={(bin, slot) => { setGridMessage(null); place.mutate({ bin, slot }); }}
        onCreate={(binSize, slot) => { setGridMessage(null); addBin.mutate({ binSize, slot }); }}
        onOpen={setOpenBin}
        onProblem={setGridMessage}
      />
      {gridMessage && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm" role="status">{gridMessage}</p>}
      {!arranging && !labelling && hasBins && !wide && <p className="text-[13px] text-muted">Tap a bin to see what's in it or add a part.</p>}
      {/* Photos suit a box of modules; names suit look-alikes like screws (DEC-036). */}
      {!labelling && bins.some((b) => b.thumbUrl) && (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          Tiles show
          <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Tiles show">
            {tileViews.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={loc.tileView === v}
                onClick={() => tileView.mutate(v)}
                className={`min-h-9 px-3 text-sm ${loc.tileView === v ? "bg-accent/15 font-semibold text-accent" : "text-muted"}`}
              >
                {v === "photos" ? "Photos" : "Names"}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  const sheet = openBin && (
    <BinSheet bin={loc.children.find((c) => c.id === openBin.id) ?? openBin} box={loc} onClose={() => setOpenBin(null)} onSwitch={setOpenBin} docked={wide} />
  );

  let body;
  if (loc.type === "project") {
    body = <KitPanel kit={loc} scanActive={mode === "idle"} />;
  } else if (isGrid) {
    body = (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {gridSection}
        <div className="flex flex-col gap-4">
          {wide && (sheet || (hasBins && !arranging && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-muted">Tap a bin to see what's in it or add a part.</p>
          )))}
          {itemsSection}
          {insideSection}
        </div>
        {!wide && sheet}
      </div>
    );
  } else {
    const first = holdsPlaces(loc.type) ? insideSection : itemsSection;
    const second = holdsPlaces(loc.type) ? itemsSection : insideSection;
    body = (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {first}
        {second}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {loc.type === "bin" ? <WhereBlock path={loc.path} showName={false} className="mb-1" /> : <Breadcrumbs path={loc.path} />}
        {edit !== null ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (edit.name.trim()) rename.mutate({ name: edit.name.trim() });
            }}
          >
            <input value={edit.name} onChange={(e) => setEdit({ name: e.target.value })} className={`${inputClass} min-w-0 flex-1`} aria-label="Name" autoFocus />
            <Button variant="primary" type="submit" disabled={!edit.name.trim() || rename.isPending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            {loc.type === "bin" && loc.binSize && <BinChip size={loc.binSize} />}
            {loc.position && <PositionTag position={loc.position} big />}
            <h1 className="min-w-0 text-xl font-semibold">{loc.name}</h1>
            <button type="button" onClick={() => setEdit({ name: loc.name })} aria-label={`Rename ${loc.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted">
              <Pencil size={18} />
            </button>
            <span className="flex-1" />
            <PinButton kind="location" id={loc.id} pinned={loc.pinned} />
          </div>
        )}
        <p className="text-[13px] text-muted">{locationTypeLabels[loc.type]}</p>
      </div>

      {loc.out && <OutBanner bin={loc} boxName={loc.path.at(-2)?.name ?? "its box"} />}

      {body}

      <section className="flex flex-col gap-3 border-t border-border pt-4" aria-label={`Manage ${loc.name}`}>
        <div className="flex items-center gap-3">
          <QrCode size={18} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 text-sm">
            {loc.code ? (
              <>Sticker <span className="break-all font-mono text-muted">{loc.code}</span></>
            ) : (
              <span className={loc.type === "site" ? "text-muted" : "text-warn"}>No sticker yet</span>
            )}
          </span>
          {mode === "idle" && (
            <Button onClick={() => { setMessage(null); setMode("assign"); }}>
              {loc.code ? "Replace sticker" : "Assign sticker"}
            </Button>
          )}
        </div>

        {mode === "assign" && (
          <Card className="flex flex-col gap-3 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <ScanLine size={20} className="text-accent" />
              Scan the new sticker for {loc.name}
            </p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => openCamera({ tap: true, title: `Sticker for ${loc.name}` })}>Use camera</Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
            </div>
          </Card>
        )}
        {/* Scan where it's going, or pick it from a list: plenty of places have no sticker. */}
        {mode === "move" && (
          <PickLocation
            title={`Where is ${loc.name} going?`}
            near={loc.path.slice(0, -1)}
            exclude={loc.id}
            onPick={(to) => move.mutate(to.id)}
            onCancel={() => setMode("idle")}
          />
        )}
        {mode === "takeout" && <TakeOutForm bin={loc} onDone={() => setMode("idle")} onCancel={() => setMode("idle")} />}
        {message && <p className="text-sm text-danger" role="alert">{message}</p>}

        {mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            {!showItems && loc.type !== "project" && (
              <Link to={`/capture?location=${loc.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
                <Plus size={18} /> {isGrid ? "Add a loose item" : "Add item here"}
              </Link>
            )}
            {!showInside && canAddInside && (
              <Link to={`/locations/new?parent=${loc.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
                <Plus size={18} /> Add inside
              </Link>
            )}
            {loc.type === "bin" && !loc.out && (
              <Button onClick={() => { setMessage(null); setMode("takeout"); }}>
                <LogOut size={18} /> Take out
              </Button>
            )}
            {loc.type !== "site" && (
              <Button onClick={() => { setMessage(null); setMode("move"); }}>
                <MoveRight size={18} /> Move
              </Button>
            )}
            {isEmpty && (
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${loc.name}? It's empty, and its history is kept.`)) remove.mutate();
                }}
              >
                <Trash2 size={18} /> Delete
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
