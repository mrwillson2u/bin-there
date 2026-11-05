import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import type { Category, ItemKind, TrackingMode } from "../../shared/api";
import { api } from "../api";
import { useToast } from "./Toast";
import { inputClass } from "./ui";

// A category box you can type in (DEC-037): typing narrows the list, arrows and Enter pick,
// and a name that isn't there yet can be added as a new category on the spot.

type Option = { kind: "none" } | { kind: "cat"; cat: Category } | { kind: "new"; name: string };

/** Starts-with matches first, then a word inside the name, then anywhere. */
export function matchCategories(categories: Category[], query: string): Category[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s/&,()-]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return categories
    .map((c) => ({ c, r: rank(c.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

/** Adds a category and puts it in the cached list straight away, so the picker can show it. */
export function useCreateCategory() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (name: string, defaults: { defaultKind?: ItemKind; defaultTracking?: TrackingMode } = {}) => {
    try {
      const created = await api<Category>("/categories", { method: "POST", body: { name, ...defaults } });
      qc.setQueryData<Category[]>(["categories"], (old) => old && [...old, created].sort((a, b) => a.name.localeCompare(b.name)));
      qc.invalidateQueries({ queryKey: ["categories"] });
      return created;
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "error" });
      throw e;
    }
  };
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  onCreate,
  allowNone = false,
  label = "Category",
  className = "",
}: {
  categories: Category[];
  value: number | null;
  onChange: (c: Category | null) => void;
  /** Adds a category by name and returns it. */
  onCreate: (name: string) => Promise<Category>;
  allowNone?: boolean;
  label?: string;
  className?: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  // What's typed; null while showing the chosen category's name.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const selected = categories.find((c) => c.id === value) ?? null;
  const typed = query?.trim() ?? "";
  const exact = categories.find((c) => c.name.toLowerCase() === typed.toLowerCase());
  const options: Option[] = [
    ...(allowNone && !typed ? [{ kind: "none" } as const] : []),
    ...matchCategories(categories, typed).map((cat) => ({ kind: "cat", cat }) as const),
    ...(typed && !exact ? [{ kind: "new", name: typed } as const] : []),
  ];
  const at = Math.min(active, options.length - 1);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, at]);

  // Open upwards when the box is low on the screen (a phone keyboard takes the bottom half).
  const place = () => {
    const r = input.current?.getBoundingClientRect();
    const room = window.visualViewport?.height ?? window.innerHeight;
    setUp(!!r && r.bottom + 260 > room && r.top > 260);
  };
  const show = () => {
    place();
    setOpen(true);
  };
  // The keyboard slides up after the box is focused, so look again when the screen shrinks.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    vv.addEventListener("resize", place);
    return () => vv.removeEventListener("resize", place);
  }, [open]);
  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(0);
  };

  const pick = async (o: Option | undefined) => {
    if (!o) return;
    close();
    if (o.kind === "none") onChange(null);
    else if (o.kind === "cat") {
      if (o.cat.id !== value) onChange(o.cat);
    } else {
      setBusy(true);
      try {
        onChange(await onCreate(o.name));
      } catch {
        // onCreate says what went wrong; the box shows the old category again.
      } finally {
        setBusy(false);
      }
    }
  };

  const optionText = (o: Option) => (o.kind === "none" ? "None" : o.kind === "cat" ? o.cat.name : o.name);

  return (
    <div className={`relative ${className}`}>
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length ? `${listId}-${at}` : undefined}
        autoComplete="off"
        enterKeyHint="done"
        disabled={busy}
        value={busy ? "Adding…" : (query ?? selected?.name ?? "")}
        placeholder={allowNone ? "None" : "Pick or type a category"}
        className={`${inputClass} w-full text-ellipsis pr-9`}
        onFocus={(e) => {
          e.currentTarget.select();
          show();
        }}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) show();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return show();
            const n = options.length;
            if (n) setActive((at + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
          } else if (e.key === "Enter") {
            if (!open) return;
            e.preventDefault();
            void pick(options[at]);
          } else if (e.key === "Escape") {
            if (open) {
              e.preventDefault();
              e.stopPropagation();
            }
            close();
          } else if (e.key === "Tab" && open && typed && options[at]?.kind === "cat") {
            // Tab takes the highlighted match, never adds a new category.
            void pick(options[at]);
          }
        }}
        onBlur={() => {
          // Typed a name that's in the list and walked away: take it. Anything else goes back.
          if (open && typed && exact) void pick({ kind: "cat", cat: exact });
          else close();
        }}
      />
      <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute left-0 right-0 z-30 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {options.length === 0 && <li className="px-3 py-2 text-sm text-muted">No categories yet. Type a name to add one.</li>}
          {options.map((o, i) => (
            <li
              key={o.kind === "cat" ? o.cat.id : o.kind}
              id={`${listId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === at}
              // Keep focus in the box so blur doesn't close the list before the pick lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(o)}
              onMouseMove={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-base ${i === at ? "bg-accent/15 text-accent" : ""} ${
                o.kind === "cat" && o.cat.id === value ? "font-semibold" : ""
              } ${o.kind === "none" ? "text-muted" : ""}`}
            >
              {o.kind === "new" ? (
                <>
                  <Plus size={16} className="shrink-0" /> Add “{o.name}” as a new category
                </>
              ) : (
                optionText(o)
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
