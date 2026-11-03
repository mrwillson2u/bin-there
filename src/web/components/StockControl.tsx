import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { levelLabels, stockLevels, type LocationDetail, type Pins, type StockLevel, type StockResult, type TrackingMode } from "../../shared/api";
import { api } from "../api";
import { useToast } from "./Toast";
import { inputClass } from "./ui";

type Props = {
  itemId: number;
  locationId: number;
  /** Shown in toasts, e.g. "Bin 7". */
  placeName: string;
  tracking: TrackingMode;
  qty: number | null;
  level: StockLevel | null;
  stale?: boolean;
  /** Smaller controls for lists (e.g. pinned parts on Home). */
  compact?: boolean;
};

// Taps are batched: tapping + five times sends one "+5" (one log entry, one Undo).
const BATCH_MS = 700;

export function useStockMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return <V,>(message: (r: StockResult, vars: V) => string | null) =>
    ({
      onSuccess: (r: StockResult, vars: V) => {
        qc.setQueryData(["item", r.item.id], r.item);
        // Update other screens showing this item right away, so counts don't flicker back while they refetch.
        qc.setQueryData<Pins>(["pins"], (old) => old && { ...old, items: old.items.map((i) => (i.id === r.item.id ? r.item : i)) });
        qc.setQueriesData<LocationDetail>({ queryKey: ["location"] }, (loc) => {
          if (!loc?.items) return loc;
          return {
            ...loc,
            items: loc.items.map((i) => {
              const p = i.itemId === r.item.id ? r.item.places.find((x) => x.locationId === loc.id) : undefined;
              return p ? { ...i, qty: p.qty, level: p.level, stale: p.stale } : i;
            }),
          };
        });
        qc.invalidateQueries({ queryKey: ["location"] });
        qc.invalidateQueries({ queryKey: ["items"] });
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["pins"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        const m = message(r, vars);
        if (m) toast.show({ message: m, undoEventId: r.eventId });
      },
      onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
    }) as const;
}

export function StockControl(p: Props) {
  if (p.tracking === "level") return <LevelControl {...p} />;
  return <CountControl {...p} />;
}

const levelTone: Record<StockLevel, string> = {
  plenty: "bg-ok/20 text-ok border-ok/50",
  low: "bg-warn/20 text-warn border-warn/50",
  out: "bg-danger/20 text-danger border-danger/50",
};

function LevelControl({ itemId, locationId, placeName, level, compact }: Props) {
  const handlers = useStockMutation();
  const set = useMutation({
    mutationFn: (l: StockLevel) => api<StockResult>("/stock/adjust", { method: "POST", body: { itemId, locationId, level: l } }),
    ...handlers((r) => (r.eventId ? `${placeName}: ${levelLabels[r.item.places.find((x) => x.locationId === locationId)?.level ?? "plenty"]}` : null)),
  });
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Stock level">
      {stockLevels.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={level === l}
          onClick={() => set.mutate(l)}
          className={`${compact ? "min-h-10 text-sm" : "min-h-14 text-base"} rounded-xl border font-semibold ${level === l ? levelTone[l] : "border-border bg-surface-2 text-muted"}`}
        >
          {levelLabels[l]}
        </button>
      ))}
    </div>
  );
}

function CountControl({ itemId, locationId, placeName, qty, stale, compact }: Props) {
  const btn = compact ? "h-11 w-11" : "h-14 w-14";
  const tall = compact ? "min-h-11" : "min-h-14";
  const handlers = useStockMutation();
  const [pending, setPending] = useState(0);
  const [inflight, setInflight] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adjust = useMutation({
    mutationFn: (delta: number) => api<StockResult>("/stock/adjust", { method: "POST", body: { itemId, locationId, delta } }),
    ...handlers((r) => {
      const ev = r.item.history[0];
      if (!r.eventId || !ev?.delta) return null;
      return ev.delta < 0 ? `Used ${-ev.delta} from ${placeName}` : `Added ${ev.delta} to ${placeName}`;
    }),
    onSettled: () => setInflight(0),
  });
  const recount = useMutation({
    mutationFn: (n: number) => api<StockResult>("/stock/recount", { method: "POST", body: { itemId, locationId, qty: n } }),
    ...handlers(() => `Counted: ${placeName}`),
  });

  // Send whatever is batched when the component goes away.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending !== 0) {
      setInflight((n) => n + pending);
      adjust.mutate(pending);
      setPending(0);
    }
  };
  useEffect(() => () => flushRef.current(), []);

  const tap = (d: number) => {
    setPending((n) => n + d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), BATCH_MS);
  };

  const startEdit = () => {
    setDraft(qty === null ? "" : String(Math.max(0, qty + inflight + pending)));
    setEditing(true);
  };
  const commitEdit = () => {
    setEditing(false);
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(n) || n < 0) return;
    if (timer.current) clearTimeout(timer.current);
    setPending(0);
    recount.mutate(n);
  };

  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commitEdit();
        }}
      >
        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Count"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commitEdit}
          className={`${inputClass} ${tall} ${compact ? "w-24 text-lg" : "flex-1 text-2xl"} text-center font-mono`}
          placeholder="How many?"
        />
        <button type="submit" className={`${tall} rounded-xl bg-accent px-4 font-semibold text-accent-fg`}>Save</button>
      </form>
    );
  }

  if (qty === null) {
    return (
      <button onClick={startEdit} className={`flex ${tall} ${compact ? "px-3 text-sm" : "w-full"} items-center justify-center rounded-xl border border-dashed border-warn/60 text-warn`}>
        {compact ? "Count" : "Not counted yet. Tap to count"}
      </button>
    );
  }

  const shown = Math.max(0, qty + inflight + pending);
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center ${compact ? "gap-1" : "gap-3"}`}>
        <button onClick={() => tap(-1)} disabled={shown === 0} aria-label="Use one" className={`flex ${btn} shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 disabled:opacity-40`}>
          <Minus size={compact ? 20 : 26} />
        </button>
        <button onClick={startEdit} aria-label={`${shown}. Tap to enter a count`} className={`flex ${tall} ${compact ? "w-14 text-xl" : "flex-1 text-[32px]"} items-center justify-center rounded-xl font-mono font-semibold tabular-nums`}>
          {shown}
        </button>
        <button onClick={() => tap(1)} aria-label="Add one" className={`flex ${btn} shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2`}>
          <Plus size={compact ? 20 : 26} />
        </button>
      </div>
      {stale && !compact && (
        <button onClick={startEdit} className="self-center text-[13px] text-warn">
          Count may be off. Tap the number to recount
        </button>
      )}
    </div>
  );
}
