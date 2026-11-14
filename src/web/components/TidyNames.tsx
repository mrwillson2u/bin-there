import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, X } from "lucide-react";
import type { Category, ItemDetail, TidyNames } from "../../shared/api";
import { api } from "../api";
import { useToast } from "./Toast";
import { Button, inputClass } from "./ui";

// Tidy a category's names (DEC-076). The AI rewrites the names of the category's parts to the
// naming convention; this dialog shows each old name beside the new one, ticked, the new name
// editable. Nothing is renamed until the button, which says how many, is pressed.

export function TidyNamesDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, error, isFetching } = useQuery({
    queryKey: ["tidy-names", category.id],
    queryFn: () => api<TidyNames>(`/categories/${category.id}/tidy-names`, { method: "POST" }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [names, setNames] = useState<Record<number, string>>({});
  const [off, setOff] = useState<number[]>([]);
  useEffect(() => {
    if (data) setNames(Object.fromEntries(data.suggestions.map((s) => [s.id, s.suggestion])));
  }, [data]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const ticked = (data?.suggestions ?? []).filter((s) => !off.includes(s.id) && (names[s.id] ?? "").trim() && (names[s.id] ?? "").trim() !== s.name);
  const rename = useMutation({
    mutationFn: async () => {
      for (const s of ticked) await api<ItemDetail>(`/items/${s.id}`, { method: "PATCH", body: { name: names[s.id]!.trim() } });
      return ticked.length;
    },
    onSuccess: (n) => {
      for (const key of ["item", "items", "needs-details"]) qc.invalidateQueries({ queryKey: [key] });
      toast.show({ message: n === 1 ? "Renamed 1 part" : `Renamed ${n} parts` });
      onClose();
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center lg:p-[5vh]">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tidy the names in ${category.name}`}
        data-tidy-names
        className="relative flex max-h-[92vh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:max-h-full lg:w-[44rem] lg:rounded-2xl lg:border lg:p-6"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-muted">
          <X size={20} />
        </button>
        <h2 className="flex items-center gap-2 pr-10 text-lg font-semibold">
          <Sparkles size={18} className="text-accent" /> Tidy the names in {category.name}
        </h2>
        {isFetching ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted" aria-live="polite">
            <Loader2 size={18} className="animate-spin text-accent" aria-hidden /> The AI is reading the names in {category.name}. This can take a minute.
          </p>
        ) : error ? (
          <p className="py-4 text-sm text-danger" role="alert">{(error as Error).message}</p>
        ) : data && data.suggestions.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            {data.looked === 0 ? "No named parts in this category yet." : `All ${data.looked === 1 ? "1 name reads" : `${data.looked} names read`} the same way already. Nothing to change.`}
          </p>
        ) : data ? (
          <>
            <p className="text-sm text-muted">
              The kind of thing first, then what tells it apart. Untick any you'd rather keep, or edit the new name. Nothing changes until you press the button.
            </p>
            <ul className="flex flex-col gap-2">
              {data.suggestions.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-xl border border-border/70 p-2" data-tidy-row={s.name}>
                  <input
                    type="checkbox"
                    className="mt-3 h-5 w-5 shrink-0"
                    checked={!off.includes(s.id)}
                    onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== s.id) : [...o, s.id]))}
                    aria-label={`Rename ${s.name}`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate px-1 text-[13px] text-muted">
                      Now: <span className="line-through">{s.name}</span>
                    </span>
                    <input
                      value={names[s.id] ?? ""}
                      onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))}
                      disabled={off.includes(s.id)}
                      className={`${inputClass} disabled:opacity-50`}
                      aria-label={`New name for ${s.name}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" variant="primary" disabled={ticked.length === 0 || rename.isPending} onClick={() => rename.mutate()}>
              {ticked.length === 0 ? "Tick the ones to rename" : ticked.length === 1 ? "Rename the 1 ticked part" : `Rename the ${ticked.length} ticked parts`}
            </Button>
          </>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          {data && data.suggestions.length > 0 ? "Cancel, rename nothing" : "Close"}
        </Button>
      </div>
    </div>
  );
}
