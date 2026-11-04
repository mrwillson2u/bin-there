import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, SkipForward } from "lucide-react";
import type { LocationDetail, LocationSummary, ScanResult } from "../../shared/api";
import { DEFAULT_GRID } from "../../shared/grid";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { useToast } from "./Toast";
import { Button, Card } from "./ui";

// Put stickers on a box full of bins in one go (DEC-021): the app names the bin to
// label next, each scan goes on that bin, and it moves on. The camera stays open
// between scans so the phone asks about it once. Tapping a bin on the grid picks it.

/** Bins in the order you'd label them: across each row of the grid, then the front strip, then the loose ones. */
export function labelOrder(box: LocationDetail): LocationSummary[] {
  const bins = box.children.filter((c) => c.type === "bin");
  const key = (b: LocationSummary) => (b.slot ? b.slot.y * 1000 + b.slot.x : 1_000_000);
  return [...bins].sort((a, b) => key(a) - key(b));
}

function where(bin: LocationSummary, box: LocationDetail): string {
  const rows = (box.grid ?? DEFAULT_GRID).rows;
  if (!bin.slot) return "not on the grid";
  if (bin.slot.y === rows) return "front strip";
  return `row ${bin.slot.y + 1}, column ${bin.slot.x + 1}`;
}

export function LabelBins({
  box,
  currentId,
  onCurrent,
  onExit,
}: {
  box: LocationDetail;
  currentId: number | null;
  onCurrent: (id: number | null) => void;
  onExit: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { openCamera, closeCamera, cameraOpen } = useScan();
  const order = labelOrder(box);
  const pending = order.filter((b) => !b.code);
  const current = order.find((b) => b.id === currentId) ?? pending[0] ?? null;

  /** The next bin without a sticker after `afterId`, wrapping round; null when there is none. */
  const next = (afterId: number): LocationSummary | null => {
    const i = order.findIndex((b) => b.id === afterId);
    const rest = [...order.slice(i + 1), ...order.slice(0, i)];
    return rest.find((b) => !b.code) ?? null;
  };

  const finish = () => {
    closeCamera();
    onExit();
  };

  const assign = useMutation({
    mutationFn: ({ bin, code }: { bin: LocationSummary; code: string }) => api<LocationDetail>(`/locations/${bin.id}/code`, { method: "POST", body: { code } }),
    onSuccess: (l, { bin }) => {
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      const n = next(bin.id);
      toast.show({ message: `Sticker ${l.code} is on ${bin.name}${n ? "" : ". Every bin has a sticker."}` });
      if (n) onCurrent(n.id);
      else finish();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  useScanHandler((code) => {
    if (!current) return false;
    const bin = current;
    api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
      .then((r) => {
        if (r.kind === "unassigned") assign.mutate({ bin, code: r.code });
        else if (r.kind === "location") toast.show({ message: `Sticker ${code} is already on ${r.location.name}`, tone: "error" });
        else toast.show({ message: `Sticker ${code} is already on an item`, tone: "error" });
      })
      .catch((e: Error) => toast.show({ message: e.message, tone: "error" }));
    return true;
  });

  const skip = () => {
    if (!current) return;
    const n = next(current.id);
    if (n) onCurrent(n.id);
  };

  const camera = () =>
    current &&
    openCamera({
      continuous: true,
      title: `Sticker for ${current.name}`,
      hint: `${current.name}: ${where(current, box)}`,
      extra: pending.length > 1 && (
        <button type="button" onClick={skip} className="flex h-11 items-center gap-1 rounded-full bg-white/15 px-3 text-sm">
          <SkipForward size={16} /> Skip
        </button>
      ),
    });

  // Keep the camera's title on the bin that's up next.
  useEffect(() => {
    if (cameraOpen) camera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, pending.length]);

  // Tell the page which bin is up (so the grid outlines it); nothing left means we're done here.
  useEffect(() => {
    if (!current) finish();
    else if (current.id !== currentId) onCurrent(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p>
        Put a sticker on <strong>{current.name}</strong> <span className="text-muted">({where(current, box)})</span> and scan it.
        {current.code && <span className="text-muted"> It has {current.code} now; the new one replaces it.</span>}
      </p>
      <p className="text-[13px] text-muted">
        {pending.length === 0 ? "Every bin has a sticker." : `${pending.length} ${pending.length === 1 ? "bin still needs" : "bins still need"} one.`} Tap a bin on the grid to do that one instead.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={camera}>
          <Camera size={18} /> Use camera
        </Button>
        {pending.length > 1 && (
          <Button onClick={skip}>
            <SkipForward size={18} /> Skip
          </Button>
        )}
        <Button variant="ghost" onClick={finish}>Done</Button>
      </div>
    </Card>
  );
}
