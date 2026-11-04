import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScanLine } from "lucide-react";
import type { Crumb, LocationDetail, LocationSummary, ScanResult } from "../../shared/api";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { contents } from "./LocationList";
import { BinChip, Button, Card } from "./ui";

/**
 * "Where is it going?" Scan a location's sticker (scanner or camera), or browse to it.
 * While mounted, scans are consumed here. Given where the thing is now (`near`), the
 * list opens beside it (the bins of the same box) and marks that place "here now".
 */
export function PickLocation({
  title,
  onPick,
  onCancel,
  near,
  children,
}: {
  title: string;
  onPick: (loc: { id: number; name: string }) => void;
  onCancel: () => void;
  /** The path of where it is now. */
  near?: Crumb[];
  children?: ReactNode;
}) {
  const { openCamera } = useScan();
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  useScanHandler((code) => {
    setError(null);
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "location") onPick(r.location);
        else setError("That sticker isn't on a bin, box or other location");
      })
      .catch((e: Error) => setError(e.message));
    return true;
  });

  return (
    <Card className="flex flex-col gap-3 border-accent/50 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <ScanLine size={20} className="text-accent" />
        {title}
      </p>
      {children}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {browsing ? (
        <Browser onPick={onPick} near={near} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={openCamera}>Scan with camera</Button>
          <Button onClick={() => setBrowsing(true)}>Pick from list</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      )}
      {browsing && (
        <Button variant="ghost" onClick={onCancel} className="self-start">Cancel</Button>
      )}
    </Card>
  );
}

function Browser({ onPick, near }: { onPick: (loc: { id: number; name: string }) => void; near?: Crumb[] }) {
  const [at, setAt] = useState<LocationDetail | null>(null);
  const { data: top } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations") });
  const open = (id: number) => api<LocationDetail>(`/locations/${id}`).then(setAt);
  const list = at ? at.children : (top ?? []);
  const hereId = near?.at(-1)?.id ?? null;
  const startId = near && near.length >= 2 ? near[near.length - 2]!.id : null;
  useEffect(() => {
    if (startId !== null) void open(startId);
  }, [startId]);

  return (
    <div className="flex flex-col gap-2">
      {at && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => (at.parentId ? open(at.parentId) : setAt(null))}
            className="flex min-h-11 items-center gap-1 text-muted"
            aria-label="Up one level"
          >
            <ChevronLeft size={18} /> {at.path.length > 1 ? at.path[at.path.length - 2]!.name : "All sites"}
          </button>
          <span className="flex-1" />
          <Button variant="primary" onClick={() => onPick(at)}>Put in {at.name}</Button>
        </div>
      )}
      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {list.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing inside.</li>}
        {list.map((l) => (
          <li key={l.id} className="flex items-center">
            <button onClick={() => onPick(l)} disabled={l.id === hereId} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-4 py-1.5 text-left disabled:opacity-60">
              {l.binSize && <BinChip size={l.binSize} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}{l.id === hereId && <span className="text-muted"> (here now)</span>}</span>
                <span className="block truncate text-[13px] text-muted">{contents(l)}</span>
              </span>
            </button>
            {l.childCount > 0 && (
              <button onClick={() => open(l.id)} className="flex min-h-12 items-center px-4 text-muted" aria-label={`Open ${l.name}`}>
                {l.childCount} <ChevronRight size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
