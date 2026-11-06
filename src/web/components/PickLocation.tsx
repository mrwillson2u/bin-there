import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Crumb, LocationDetail, LocationSummary, ScanResult } from "../../shared/api";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { contents } from "./LocationList";
import { BinChip, Button, PositionTag } from "./ui";

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
  exclude,
  children,
}: {
  title: string;
  onPick: (loc: { id: number; name: string }) => void;
  onCancel: () => void;
  /** The path of where it is now. */
  near?: Crumb[];
  /** A place that can't be picked or opened: the one being moved (so nothing goes inside itself). */
  exclude?: number;
  children?: ReactNode;
}) {
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

  // The scan target (DEC-044) stays while browsing: a scan still picks, whichever way you're looking.
  return (
    <ScanTarget
      what={title}
      actions={
        <>
          {!browsing && <Button onClick={() => setBrowsing(true)}>Pick from list</Button>}
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </>
      }
    >
      {children}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {browsing && <Browser onPick={onPick} near={near} exclude={exclude} />}
    </ScanTarget>
  );
}

/**
 * Browse to the place (DEC-032): tapping a row goes inside it; its Choose button picks it.
 * Inside a place, "Choose <it>" at the top picks the place you're in. Where the thing is now
 * can be opened but not chosen.
 */
const chooseClass = "inline-flex min-h-10 shrink-0 items-center rounded-lg border border-accent/60 px-3 text-sm font-medium text-accent active:bg-accent/15";

function Browser({ onPick, near, exclude }: { onPick: (loc: { id: number; name: string }) => void; near?: Crumb[]; exclude?: number }) {
  const [at, setAt] = useState<LocationDetail | null>(null);
  const { data: top } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations") });
  const open = (id: number) => api<LocationDetail>(`/locations/${id}`).then(setAt);
  const list = (at ? at.children : (top ?? [])).filter((l) => l.id !== exclude);
  const hereId = near?.at(-1)?.id ?? null;
  // Start beside where it is now: in the place that holds it, so its neighbours are one tap away.
  // Something sitting right in a site starts inside that site; with one site and nothing to go by, start there.
  const startId = near?.length ? near[Math.max(0, near.length - 2)]!.id : top?.length === 1 ? top[0]!.id : null;
  useEffect(() => {
    if (startId !== null) void open(startId);
  }, [startId]);
  const canChoose = (id: number) => id !== hereId && id !== exclude;

  return (
    <div className="flex flex-col gap-2">
      {at && (
        <>
          <button
            onClick={() => (at.parentId ? open(at.parentId) : setAt(null))}
            className="flex min-h-10 items-center gap-1 self-start text-sm text-muted"
            aria-label="Up one level"
          >
            <ChevronLeft size={18} /> {at.path.length > 1 ? at.path[at.path.length - 2]!.name : "All sites"}
          </button>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate">
              <span className="text-muted">Inside </span>
              <span className="font-semibold">{at.name}</span>
              {at.id === hereId && <span className="text-muted"> (here now)</span>}
            </p>
            {canChoose(at.id) && (
              <button onClick={() => onPick(at)} className={`${chooseClass} max-w-[55%]`}>
                <span className="truncate">Choose {at.name}</span>
              </button>
            )}
          </div>
        </>
      )}
      {list.length > 0 && <p className="text-[13px] text-muted">Tap a place to look inside it.</p>}
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {list.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing inside.</li>}
        {list.map((l) => (
          <li key={l.id} className="flex items-center">
            <button onClick={() => open(l.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-1.5 pl-4 pr-2 text-left active:bg-surface-2">
              {l.binSize && <BinChip size={l.binSize} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {l.position && <PositionTag position={l.position} big />}
                  <span className="truncate">
                    {l.name}
                    {l.id === hereId && <span className="text-muted"> (here now)</span>}
                  </span>
                </span>
                <span className="block truncate text-[13px] text-muted">{contents(l)}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
            </button>
            {canChoose(l.id) && (
              <button onClick={() => onPick(l)} aria-label={`Choose ${l.name}`} className={`mr-2 ${chooseClass}`}>
                Choose
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
