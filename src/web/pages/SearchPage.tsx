import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import type { ItemSummary } from "../../shared/api";
import { api } from "../api";
import { BulkBar, SelectButton, useSelection } from "../components/BulkBar";
import { ItemList } from "../components/ItemList";
import { inputClass } from "../components/ui";

/** Focused search (DEC-026): only the parts that match what you type. Browsing is on Inventory. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text);
  const sel = useSelection();

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setParams((p) => {
        if (text.trim()) p.set("q", text);
        else p.delete("q");
        return p;
      }, { replace: true });
    }, 200);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const { data, isFetching } = useQuery({
    queryKey: ["items", { q }],
    queryFn: () => api<ItemSummary[]>(`/items?q=${encodeURIComponent(q)}`),
    enabled: q !== "",
    placeholderData: keepPreviousData,
  });

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
      {!q ? (
        <p className="px-1 py-6 text-center text-muted">Type a name, category, supplier or note. Every word must match.</p>
      ) : (
        <>
          <div className="flex items-center justify-end gap-3 text-[13px] text-muted">
            {isFetching && <span>Searching…</span>}
            {data && data.length > 0 && <SelectButton on={sel.on} onClick={() => (sel.on ? sel.stop() : sel.start())} />}
          </div>
          {data && <ItemList items={data} empty={`Nothing matches “${q}”.`} select={sel.selection} />}
        </>
      )}
      {sel.on && <BulkBar ids={sel.ids} shown={data ?? []} onSelectAll={() => sel.setAll((data ?? []).map((i) => i.id))} onClose={sel.stop} />}
    </div>
  );
}
