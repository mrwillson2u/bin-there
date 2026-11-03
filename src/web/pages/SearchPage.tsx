import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import type { ItemSummary } from "../../shared/api";
import { api } from "../api";
import { ItemList } from "../components/ItemList";
import { inputClass } from "../components/ui";

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const needs = params.get("needs") === "1";
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text);
      setParams((p) => {
        if (text) p.set("q", text);
        else p.delete("q");
        return p;
      }, { replace: true });
    }, 200);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const { data, isFetching } = useQuery({
    queryKey: ["items", { q, needs }],
    queryFn: () => api<ItemSummary[]>(`/items?q=${encodeURIComponent(q)}${needs ? "&needs=1" : ""}`),
    placeholderData: keepPreviousData,
  });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<{ needsDetails: number }>("/stats") });

  const toggleNeeds = () =>
    setParams((p) => {
      if (needs) p.delete("needs");
      else p.set("needs", "1");
      return p;
    }, { replace: true });

  return (
    <div className="flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-3xl">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          enterKeyHint="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search parts, e.g. m3 10"
          aria-label="Search"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          className={`${inputClass} w-full pl-10 pr-10`}
        />
        {text && (
          <button onClick={() => setText("")} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleNeeds}
          aria-pressed={needs}
          className={`min-h-9 rounded-full border px-3 text-sm ${needs ? "border-warn bg-warn/15 text-warn" : "border-border text-muted"}`}
        >
          Needs details{stats ? ` (${stats.needsDetails})` : ""}
        </button>
        <span className="flex-1" />
        {isFetching && <span className="text-[13px] text-muted">Searching…</span>}
      </div>
      {!q && !needs && <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Recently changed</h2>}
      {data && <ItemList items={data} empty={needs ? "Nothing needs details." : q ? `Nothing matches “${q}”.` : "No items yet. Scan a sticker or tap Add item."} />}
    </div>
  );
}
