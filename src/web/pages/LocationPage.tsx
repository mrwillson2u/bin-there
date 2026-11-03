import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoveRight, Plus, QrCode, ScanLine } from "lucide-react";
import { locationTypeLabels, type LocationDetail, type ScanResult } from "../../shared/api";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { LocationList } from "../components/LocationList";
import { BinChip, Breadcrumbs, Button, Card } from "../components/ui";

type Mode = "idle" | "assign" | "move";

export function LocationPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const { data: loc, error } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api<LocationDetail>(`/locations/${id}`),
  });
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState<string | null>(null);

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
    mutationFn: (parentId: number | null) =>
      api<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: { parentId } }),
    onSuccess: (l) => done(`Moved to ${l.path.length > 1 ? l.path[l.path.length - 2]!.name : "top level"}`),
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
          <h1 className="text-xl font-semibold">{loc.name}</h1>
        </div>
        <p className="text-[13px] text-muted">
          {locationTypeLabels[loc.type]}
          {loc.code ? (
            <> · sticker <span className="font-mono">{loc.code}</span></>
          ) : (
            loc.type !== "put_back" && <> · <span className="text-warn">no sticker</span></>
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
            {mode === "move" && (
              <Button onClick={() => move.mutate(null)}>Move to top level</Button>
            )}
            <Button variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link to={`/locations/new?parent=${loc.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
            <Plus size={18} /> Add inside
          </Link>
          {loc.type !== "put_back" && (
            <>
              <Button onClick={() => { setMessage(null); setMode("assign"); }}>
                <QrCode size={18} /> {loc.code ? "Replace sticker" : "Assign sticker"}
              </Button>
              <Button onClick={() => { setMessage(null); setMode("move"); }}>
                <MoveRight size={18} /> Move
              </Button>
            </>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Inside</h2>
        <LocationList locations={loc.children} empty="Nothing inside yet." />
      </section>
    </div>
  );
}
