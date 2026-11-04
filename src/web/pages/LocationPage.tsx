import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, LayoutGrid, MoveRight, Plus, QrCode, ScanLine, Trash2 } from "lucide-react";
import { locationTypeLabels, type BinSize, type LocationDetail, type LocationSummary, type ScanResult } from "../../shared/api";
import type { Slot } from "../../shared/grid";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { LocationList } from "../components/LocationList";
import { BoxGrid } from "../components/BoxGrid";
import { BinSheet } from "../components/BinSheet";
import { useToast } from "../components/Toast";
import { KitPanel } from "../components/KitPanel";
import { LocationItemList } from "../components/ItemList";
import { StockControl } from "../components/StockControl";
import { PinButton } from "../components/PinButton";
import { BinChip, Breadcrumbs, Button, Card, itemName, Thumb } from "../components/ui";

type Mode = "idle" | "assign" | "move";

export function LocationPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: loc, error } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api<LocationDetail>(`/locations/${id}`),
  });
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const [openBin, setOpenBin] = useState<LocationSummary | null>(null);
  const toast = useToast();

  const done = (msg: string) => {
    setMode("idle");
    setMessage(msg);
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
  };
  const fail = (e: Error) => setMessage(e.message);

  const assign = useMutation({
    mutationFn: (code: string) => api<LocationDetail>(`/locations/${id}/code`, { method: "POST", body: { code } }),
    onSuccess: (l) => done(`Sticker ${l.code} assigned`),
    onError: fail,
  });
  const move = useMutation({
    mutationFn: (parentId: number) =>
      api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: { parentId } }),
    onSuccess: (l) => done(`Moved to ${l.path.at(-2)?.name ?? "?"}`),
    onError: fail,
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
      setMessage(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["location", id] });
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
    onError: fail,
  });

  // Only an empty location can be deleted (soft delete: hidden, history kept).
  const remove = useMutation({
    mutationFn: () => api<{ parentId: number | null }>(`/locations/${id}`, { method: "DELETE" }),
    onSuccess: ({ parentId }) => {
      navigate(parentId ? `/locations/${parentId}` : "/", { replace: true });
      qc.removeQueries({ queryKey: ["location", id] });
      qc.invalidateQueries();
    },
    onError: fail,
  });

  // In assign/move mode, the next scan is consumed here instead of navigating.
  useScanHandler((code) => {
    if (mode === "assign") {
      assign.mutate(code);
      return true;
    }
    if (mode === "move") {
      api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
        .then((r) => {
          if (r.kind === "location") move.mutate(r.location.id);
          else setMessage(`Sticker ${code} isn't a location`);
        })
        .catch(fail);
      return true;
    }
    return false;
  });

  const { openCamera } = useScan();

  if (error) return <p className="text-danger">{(error as Error).message}</p>;
  if (!loc) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Breadcrumbs path={loc.path} />
        <div className="flex items-center gap-2">
          {loc.type === "bin" && loc.binSize && <BinChip size={loc.binSize} />}
          <h1 className="flex-1 text-xl font-semibold">{loc.name}</h1>
          <PinButton kind="location" id={loc.id} pinned={loc.pinned} />
        </div>
        <p className="text-[13px] text-muted">
          {locationTypeLabels[loc.type]}
          {loc.code ? (
            <> · sticker <span className="font-mono">{loc.code}</span></>
          ) : (
            loc.type !== "site" && <> · <span className="text-warn">no sticker</span></>
          )}
        </p>
      </div>

      {message && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm" role="status">{message}</p>}

      {mode !== "idle" ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ScanLine size={20} className="text-accent" />
            {mode === "assign" ? "Scan the sticker for this location" : "Scan where this is going"}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={openCamera}>Use camera</Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {loc.type !== "project" && (
            <Link to={`/locations/new?parent=${loc.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
              <Plus size={18} /> Add inside
            </Link>
          )}
          <Button onClick={() => { setMessage(null); setMode("assign"); }}>
            <QrCode size={18} /> {loc.code ? "Replace sticker" : "Assign sticker"}
          </Button>
          {loc.type !== "site" && (
            <Button onClick={() => { setMessage(null); setMode("move"); }}>
              <MoveRight size={18} /> Move
            </Button>
          )}
          {loc.children.length === 0 && loc.items.length === 0 && (
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

      {loc.type === "project" ? (
        <KitPanel kit={loc} scanActive={mode === "idle"} />
      ) : (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Items</h2>
            <Link to={`/capture?location=${loc.id}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-accent">
              <Camera size={18} /> Add item here
            </Link>
          </div>
          {loc.items.length === 0 ? (
            <p className="px-1 py-3 text-center text-muted">No items here yet.</p>
          ) : loc.items.length === 1 && loc.items[0]!.hasStock ? (
            <SingleItem loc={loc} />
          ) : (
            <LocationItemList items={loc.items} />
          )}
        </section>

        {loc.type === "gridded_box" ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Bins</h2>
              <button
                type="button"
                onClick={() => { setMessage(null); setOpenBin(null); setArranging((a) => !a); }}
                className={`inline-flex min-h-11 items-center gap-1.5 px-1 ${arranging ? "font-semibold text-accent" : "text-accent"}`}
              >
                <LayoutGrid size={18} /> {arranging ? "Done" : loc.children.some((c) => c.type === "bin") ? "Add or arrange bins" : "Add bins"}
              </button>
            </div>
            <BoxGrid
              box={loc}
              arranging={arranging}
              onPlace={(bin, slot) => { setMessage(null); place.mutate({ bin, slot }); }}
              onCreate={(binSize, slot) => { setMessage(null); addBin.mutate({ binSize, slot }); }}
              onOpen={setOpenBin}
              onProblem={setMessage}
            />
            {!arranging && loc.children.some((c) => c.type === "bin") && (
              <p className="text-[13px] text-muted">Tap a bin to see what's in it or add a part.</p>
            )}
            {openBin && <BinSheet bin={loc.children.find((c) => c.id === openBin.id) ?? openBin} box={loc} onClose={() => setOpenBin(null)} onSwitch={setOpenBin} />}
            {loc.children.some((c) => c.type !== "bin") && (
              <LocationList locations={loc.children.filter((c) => c.type !== "bin")} empty="" />
            )}
          </section>
        ) : (
          (loc.children.length > 0 || loc.items.length === 0) && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Inside</h2>
              <LocationList locations={loc.children} empty="No boxes or bins inside." />
            </section>
          )
        )}
      </div>
      )}
    </div>
  );
}

/** A bin with one kind of part: its +/− is right here (F4). */
function SingleItem({ loc }: { loc: LocationDetail }) {
  const i = loc.items[0]!;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <Link to={`/items/${i.itemId}`} className="flex items-center gap-3">
        <Thumb url={i.thumbUrl} size={56} />
        <span className={`flex-1 font-semibold ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
      </Link>
      <StockControl itemId={i.itemId} locationId={loc.id} placeName={loc.name} tracking={i.tracking} qty={i.qty} level={i.level} stale={i.stale} />
    </Card>
  );
}
