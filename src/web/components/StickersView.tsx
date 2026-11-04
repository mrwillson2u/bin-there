import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine, Undo2, Volume2, VolumeX } from "lucide-react";
import type { LocationDetail, LocationSummary, ScanResult } from "../../shared/api";
import { api } from "../api";
import { CameraView, type CodeNote } from "../scan/CameraView";
import { scanBad, scanOk, setSound, soundOn } from "../scan/feedback";
import { useScanHandler } from "../scan/ScanProvider";
import { BoxGrid } from "./BoxGrid";
import { Button } from "./ui";

// Putting stickers on a box of bins (DEC-022). The camera preview stays on above the
// grid, but nothing is taken until you've tapped a bin and then tapped Scan. Brackets
// show what the camera sees; the bin that already has the aimed-at sticker gets a
// dashed outline, so you can check a box just by pointing at its stickers. A sticker
// that's on the wrong bin can be moved onto the right one, and the last change undone.

type Ref = { id: number; name: string };
type Last = { bin: Ref; code: string; prevCode: string | null; from: Ref | null };
type Status = { text: string; tone: "ok" | "warn" | "danger" | "muted" };
type Action = { label: string; run?: () => void; tone: "go" | "move" | "off" };

const statusTone: Record<Status["tone"], string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-muted",
};

export function StickersView({ box, onExit }: { box: LocationDetail; onExit: () => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [aimed, setAimed] = useState<string | null>(null);
  /** The last code from the hardware scanner, outlined on the grid until the next tap. */
  const [scanned, setScanned] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [sound, setSoundState] = useState(soundOn);

  const bins = box.children.filter((c) => c.type === "bin");
  const byCode = new Map(bins.flatMap((b) => (b.code ? [[b.code, b] as const] : [])));
  const selected = bins.find((b) => b.id === selectedId) ?? null;
  const sibling = aimed ? (byCode.get(aimed) ?? null) : null;
  // Where a sticker not on this box's bins is (if anywhere): asked once per code.
  const lookup = useQuery({
    queryKey: ["scan", aimed],
    queryFn: () => api<ScanResult>(`/scan/${encodeURIComponent(aimed!)}`),
    enabled: aimed !== null && sibling === null,
    staleTime: 10_000,
  });
  const seenCode = scanned ?? aimed;
  const seenId = seenCode ? (byCode.get(seenCode)?.id ?? null) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["scan"] });
  };

  const assign = useMutation({
    mutationFn: async ({ bin, code, from }: { bin: LocationSummary; code: string; from: Ref | null }) => {
      await api<LocationDetail>(`/locations/${bin.id}/code`, { method: "POST", body: { code, move: from !== null } });
      return { bin: { id: bin.id, name: bin.name }, code, from, prevCode: bin.code };
    },
    onSuccess: (done) => {
      setLast(done);
      setStatus({ text: done.from ? `${done.code} moved from ${done.from.name} to ${done.bin.name}` : `${done.code} is on ${done.bin.name}`, tone: "ok" });
      setSelectedId(null);
      setScanned(null);
      refresh();
    },
    onError: (e: Error) => {
      scanBad();
      setStatus({ text: e.message, tone: "danger" });
    },
  });

  const undo = useMutation({
    mutationFn: async (l: Last) => {
      await api(`/locations/${l.bin.id}`, { method: "PATCH", body: { code: l.prevCode } });
      if (l.from) await api(`/locations/${l.from.id}/code`, { method: "POST", body: { code: l.code } });
    },
    onSuccess: (_r, l) => {
      setLast(null);
      setStatus({ text: l.from ? `Undone: ${l.code} is back on ${l.from.name}` : `Undone: ${l.code} is off ${l.bin.name}`, tone: "muted" });
      refresh();
    },
    onError: (e: Error) => setStatus({ text: e.message, tone: "danger" }),
  });

  const action = (): Action => {
    if (!selected) return { label: "Tap a bin first", tone: "off" };
    if (!aimed) return { label: `Aim at the sticker for ${selected.name}`, tone: "off" };
    const put = (from: Ref | null) => () => assign.mutate({ bin: selected, code: aimed, from });
    if (sibling) {
      if (sibling.id === selected.id) return { label: `${aimed} is already on ${selected.name}`, tone: "off" };
      return { label: `Move ${aimed} here from ${sibling.name}`, tone: "move", run: put(sibling) };
    }
    const r = lookup.data;
    if (!r) return { label: lookup.isError ? "Couldn't check that sticker" : `Checking ${aimed}…`, tone: "off" };
    if (r.kind === "unit") return { label: `${aimed} is on an item, not a bin`, tone: "off" };
    if (r.kind === "location") return { label: `Move ${aimed} here from ${r.location.name}`, tone: "move", run: put(r.location) };
    return { label: selected.code ? `Put ${aimed} on ${selected.name} (replaces ${selected.code})` : `Put ${aimed} on ${selected.name}`, tone: "go", run: put(null) };
  };
  const act = action();

  const note = (code: string): CodeNote => {
    const b = byCode.get(code);
    if (b) return b.id === selectedId ? { text: `on ${b.name} ✓`, tone: "ok" } : { text: `on ${b.name}`, tone: "warn" };
    const r = code === aimed ? lookup.data : undefined;
    if (!r) return null;
    if (r.kind === "unassigned") return { text: "not used yet", tone: "info" };
    if (r.kind === "location") return { text: `on ${r.location.name}`, tone: "warn" };
    return { text: "on an item", tone: "danger" };
  };

  const scan = () => {
    if (assign.isPending) return;
    if (act.run) {
      scanOk();
      act.run();
    } else {
      scanBad();
      setStatus({ text: act.label, tone: "warn" });
    }
  };

  // The hardware scanner's trigger is as deliberate as the Scan button, so on a chosen
  // bin a scan goes straight on. With no bin chosen it just shows whose sticker it is.
  useScanHandler((code) => {
    setScanned(code);
    const b = byCode.get(code);
    if (!selected) {
      setStatus(b ? { text: `${code} is on ${b.name} (dashed outline)`, tone: "muted" } : { text: `Tap a bin first, then scan ${code}`, tone: "warn" });
      return true;
    }
    if (b?.id === selected.id) {
      setStatus({ text: `${code} is already on ${selected.name}`, tone: "ok" });
      return true;
    }
    if (b) {
      assign.mutate({ bin: selected, code, from: b });
      return true;
    }
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unassigned") assign.mutate({ bin: selected, code, from: null });
        else if (r.kind === "location") assign.mutate({ bin: selected, code, from: r.location });
        else setStatus({ text: `${code} is on an item, not a bin`, tone: "danger" });
      })
      .catch((e: Error) => setStatus({ text: e.message, tone: "danger" }));
    return true;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const pick = (bin: LocationSummary) => {
    setSelectedId((id) => (id === bin.id ? null : bin.id));
    setScanned(null);
  };

  const buttonTone = act.tone === "go" ? "bg-accent text-accent-fg" : act.tone === "move" ? "bg-warn text-white" : "bg-surface-2 text-muted border border-border";

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg" role="dialog" aria-label={`Stickers for ${box.name}`}>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] lg:max-w-5xl">
        <header className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight">Stickers</h2>
            <p className="truncate text-[13px] text-muted">{box.name}</p>
          </div>
          <button
            type="button"
            onClick={() => { setSound(!sound); setSoundState(!sound); }}
            aria-label={sound ? "Turn the beep off" : "Turn the beep on"}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted"
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <Button variant="primary" onClick={onExit}>Done</Button>
        </header>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <CameraView onTarget={setAimed} note={note} className="h-[32dvh] min-h-44 rounded-2xl lg:h-[50dvh]" />
          <BoxGrid
            box={box}
            arranging={false}
            stickers
            selectedId={selectedId}
            seenId={seenId}
            onOpen={pick}
            onPlace={() => {}}
            onCreate={() => {}}
            onProblem={() => {}}
          />
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-bg pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          <div className="flex min-h-11 items-center gap-2">
            <p className={`min-w-0 flex-1 text-sm ${status ? statusTone[status.tone] : "text-muted"}`} role="status">
              {status?.text ?? "Tap a bin, aim at its sticker, then tap Scan. A dashed outline marks the bin that has the sticker you're aiming at."}
            </p>
            {last && (
              <Button variant="ghost" onClick={() => undo.mutate(last)} disabled={undo.isPending} className="shrink-0">
                <Undo2 size={16} /> Undo
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={scan}
            disabled={assign.isPending}
            className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl px-4 text-center text-lg font-semibold ${buttonTone}`}
          >
            <ScanLine size={22} className="shrink-0" /> <span className="min-w-0">{act.label}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
