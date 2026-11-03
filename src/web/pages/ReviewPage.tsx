import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { ReviewEntry, StockResult } from "../../shared/api";
import { api } from "../api";
import { useStockMutation } from "../components/StockControl";
import { timeAgo } from "../components/EventList";
import { inputClass, itemName, pathText, Thumb } from "../components/ui";

// Counts worth checking again (DEC-001): old, or nudged a lot since the last count.
// Grouped by location so you can walk the garage once. "Still N" is one tap; a
// different number is a recount like any other, with Undo.

export function ReviewPage() {
  const { data } = useQuery({ queryKey: ["review"], queryFn: () => api<ReviewEntry[]>("/review") });
  if (!data) return <p className="text-muted">Loading…</p>;

  const groups: { key: string; path: ReviewEntry["path"]; rows: ReviewEntry[] }[] = [];
  for (const r of data) {
    const key = String(r.locationId);
    const g = groups.find((x) => x.key === key);
    if (g) g.rows.push(r);
    else groups.push({ key, path: r.path, rows: [r] });
  }

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Counts worth checking</h1>
        <p className="text-[13px] text-muted">
          Exact counts that are over three months old or have been nudged ten or more times since they were last counted.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="px-1 py-6 text-center text-muted">Every count is fresh.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              <Link to={`/locations/${g.rows[0]!.locationId}`}>{pathText(g.path)}</Link>
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {g.rows.map((r) => (
                <ReviewRow key={`${r.itemId}-${r.locationId}`} entry={r} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function why(r: ReviewEntry): string {
  const days = Math.floor((Date.now() - new Date(r.lastCountedAt.replace(" ", "T") + "Z").getTime()) / 86_400_000);
  if (r.changesSinceCount >= 10) return `changed ${r.changesSinceCount} times since counted`;
  return days >= 1 ? `counted ${days} days ago` : `counted ${timeAgo(r.lastCountedAt)}`;
}

function ReviewRow({ entry: r }: { entry: ReviewEntry }) {
  const placeName = r.path.at(-1)?.name ?? "";
  const handlers = useStockMutation();
  const recount = useMutation({
    mutationFn: (n: number) => api<StockResult>("/stock/recount", { method: "POST", body: { itemId: r.itemId, locationId: r.locationId, qty: n } }),
    ...handlers((_, n) => (n === r.qty ? `Still ${n} in ${placeName}` : `Counted ${n} in ${placeName}`)),
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(n) || n < 0) return;
    recount.mutate(n);
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Link to={`/items/${r.itemId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb url={r.thumbUrl} size={44} />
          <span className="min-w-0">
            <span className={`block truncate ${r.name ? "" : "italic text-muted"}`}>{itemName(r.name)}</span>
            <span className="block truncate text-[13px] text-muted">{why(r)}</span>
          </span>
        </Link>
        <span className="font-mono text-lg font-semibold tabular-nums">{r.qty}</span>
      </div>
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`New count for ${itemName(r.name)}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} min-h-11 flex-1 text-center font-mono text-lg`}
            placeholder="How many?"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-fg">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-2 text-accent">Cancel</button>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => recount.mutate(r.qty)}
            disabled={recount.isPending}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ok/50 bg-ok/15 font-semibold text-ok disabled:opacity-50"
          >
            <Check size={18} /> Still {r.qty}
          </button>
          <button
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
            className="min-h-11 rounded-xl border border-border bg-surface-2"
          >
            Different…
          </button>
        </div>
      )}
    </li>
  );
}
