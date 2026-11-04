import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Camera, ChevronRight, Copy, ImageOff, LayoutGrid, List, PencilLine, Pin, Search, X } from "lucide-react";
import {
  inventorySortLabels,
  itemKindLabels,
  itemKinds,
  levelLabels,
  type Category,
  type Inventory,
  type ItemSummary,
  type LocationSummary,
  type Stats,
} from "../../shared/api";
import { api } from "../api";
import { ItemTotal } from "../components/ItemList";
import { StockControl } from "../components/StockControl";
import { Badge, Card, inputClass, itemName, PlacePath, Thumb } from "../components/ui";
import { FirstSite } from "./LocationsPage";
import { outText } from "../components/TakeOut";

// Inventory (DEC-026): every part, searchable and filterable, as a list or as tiles, with pinned
// parts on top. Filters live in the URL so Back (say, after saving a part's details) lands on the
// same filtered list.

type View = "list" | "tiles";
const VIEW_KEY = "bt.inventoryView";
const readView = (): View => (localStorage.getItem(VIEW_KEY) === "tiles" ? "tiles" : "list");

const FILTER_KEYS = ["q", "cat", "kind", "needs", "low", "out", "stale"] as const;

type Tone = "warn" | "danger" | "info" | "accent";
const statusFilters: { key: "needs" | "low" | "out" | "stale"; label: string; stat: keyof Stats; tone: Tone }[] = [
  { key: "needs", label: "Needs details", stat: "needsDetails", tone: "warn" },
  { key: "low", label: "Running low", stat: "low", tone: "danger" },
  { key: "out", label: "Checked out", stat: "checkedOut", tone: "info" },
  { key: "stale", label: "Counts to check", stat: "stale", tone: "accent" },
];
const chipOn: Record<Tone, string> = {
  warn: "border-warn bg-warn/15 text-warn",
  danger: "border-danger bg-danger/15 text-danger",
  info: "border-info bg-info/15 text-info",
  accent: "border-accent bg-accent/15 text-accent",
};
const countTone: Record<Tone, string> = { warn: "text-warn", danger: "text-danger", info: "text-info", accent: "text-accent" };
const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm";

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [view, setView] = useState<View>(readView);
  const pickView = (v: View) => {
    localStorage.setItem(VIEW_KEY, v);
    setView(v);
  };
  // Start from the address bar, not the last render, so two quick changes can't undo each other.
  const edit = (change: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(window.location.search);
    change(p);
    setParams(p, { replace: true });
  };
  const set = (key: string, value: string | null) => edit((p) => (value ? p.set(key, value) : p.delete(key)));

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== text) set("q", text.trim() ? text : null);
    }, 200);
    return () => clearTimeout(t);
  }, [text]); // on typing only: a Back to ?q=… must not be overwritten

  const q = params.get("q") ?? "";
  const filtering = FILTER_KEYS.some((k) => params.get(k));
  const query = new URLSearchParams();
  for (const k of [...FILTER_KEYS, "sort"]) {
    const v = params.get(k);
    if (v) query.set(k, v);
  }
  const qs = query.toString();

  const { data: sites } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations") });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats") });
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const inv = useInfiniteQuery({
    queryKey: ["items", "inventory", qs],
    queryFn: ({ pageParam }) => api<Inventory>(`/inventory?${qs}${qs ? "&" : ""}offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: keepPreviousData,
  });

  // Load the next page as the end of the list comes into view (the button below works too).
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = inv;
  useEffect(() => {
    const el = end.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && !isFetchingNextPage && fetchNextPage(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Filters that are on move to the front of the chip row; bring it back to the start so they're in sight.
  const chips = useRef<HTMLDivElement>(null);
  const onKey = ["needs", "low", "out", "stale", "cat", "kind"].map((k) => params.get(k) ?? "").join("|");
  useEffect(() => chips.current?.scrollTo({ left: 0 }), [onKey]);

  if (sites && sites.length === 0) return <FirstSite />;

  const pages = inv.data?.pages ?? [];
  const pinned = pages[0]?.pinned ?? [];
  const rest = pages.flatMap((p) => p.items);
  const total = pages[0]?.total ?? 0;
  const status = statusFilters.find((f) => params.get(f.key) === "1");
  const sortOptions: [string, string][] = [
    ["", q ? "Best match" : inventorySortLabels.name],
    ...(q ? ([["name", inventorySortLabels.name]] as [string, string][]) : []),
    ["recent", inventorySortLabels.recent],
    ["added", inventorySortLabels.added],
  ];
  const clear = () => {
    setText("");
    edit((p) => FILTER_KEYS.forEach((k) => p.delete(k)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">Inventory</h1>
        <Link to="/capture" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4">
          <Camera size={18} /> Add item
        </Link>
      </div>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          enterKeyHint="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search parts, e.g. m3 10"
          aria-label="Search parts"
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

      {/* One line that scrolls sideways on a phone; wraps on a wide screen. */}
      <div
        ref={chips}
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&>*]:shrink-0"
        role="group"
        aria-label="Filters"
      >
        {filtering && (
          <button onClick={clear} className={`${chip} border-border text-accent`}>
            <X size={14} /> Clear
          </button>
        )}
        {/* Filters that are on come first, so on a phone they're never scrolled out of sight. */}
        {[
          ...statusFilters.map((f) => {
            const on = params.get(f.key) === "1";
            const n = stats?.[f.stat] ?? 0;
            return {
              on,
              node:
                !on && n === 0 ? null : (
                  <button key={f.key} onClick={() => set(f.key, on ? null : "1")} aria-pressed={on} className={`${chip} ${on ? chipOn[f.tone] : "border-border text-text"}`}>
                    {f.key === "needs" && <PencilLine size={14} className={on ? "" : countTone.warn} />}
                    {f.label}
                    <span className={`font-semibold tabular-nums ${on ? "" : countTone[f.tone]}`}>{n}</span>
                  </button>
                ),
            };
          }),
          {
            on: !!params.get("cat"),
            node: (
              <select
                key="cat"
                aria-label="Category"
                value={params.get("cat") ?? ""}
                onChange={(e) => set("cat", e.target.value || null)}
                className={`${chip} bg-transparent ${params.get("cat") ? chipOn.accent : "border-border text-text"}`}
              >
                <option value="">All categories</option>
                {cats?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="none">No category</option>
              </select>
            ),
          },
          {
            on: !!params.get("kind"),
            node: (
              <select
                key="kind"
                aria-label="Kind"
                value={params.get("kind") ?? ""}
                onChange={(e) => set("kind", e.target.value || null)}
                className={`${chip} bg-transparent ${params.get("kind") ? chipOn.accent : "border-border text-text"}`}
              >
                <option value="">Any kind</option>
                {itemKinds.map((k) => (
                  <option key={k} value={k}>{itemKindLabels[k]}</option>
                ))}
              </select>
            ),
          },
        ]
          .sort((a, b) => Number(b.on) - Number(a.on))
          .map((c) => c.node)}
      </div>

      {status && <StatusNote filter={status.key} />}

      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span className="flex-1" aria-live="polite">
          {inv.data && (filtering ? `${total} found` : `${total} item${total === 1 ? "" : "s"}`)}
        </span>
        <label className="flex items-center gap-1">
          <ArrowUpDown size={14} />
          <select aria-label="Sort by" value={params.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value || null)} className="min-h-9 bg-transparent text-text">
            {sortOptions.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="View">
          <ViewButton on={view === "list"} onClick={() => pickView("list")} label="List view" icon={<List size={18} />} />
          <ViewButton on={view === "tiles"} onClick={() => pickView("tiles")} label="Tile view" icon={<LayoutGrid size={18} />} />
        </div>
      </div>

      {!inv.data ? (
        <p className="text-muted">Loading…</p>
      ) : total === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-6 text-center text-muted">
          {filtering ? (
            <>
              {q ? `Nothing matches “${q}”` : "Nothing matches these filters"}
              <button onClick={clear} className="min-h-11 text-accent">Clear filters</button>
            </>
          ) : (
            "No parts yet. Tap Add item, or scan a new sticker."
          )}
        </Card>
      ) : view === "list" ? (
        <ListView pinned={pinned} items={rest} />
      ) : (
        <TileView pinned={pinned} items={rest} />
      )}

      <div ref={end} />
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="min-h-11 self-center px-4 text-accent">
          {isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ViewButton({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={label} title={label} className={`flex h-9 w-10 items-center justify-center ${on ? "bg-accent/15 text-accent" : "text-muted"}`}>
      {icon}
    </button>
  );
}

/** What a status filter shows, and the screen that works through it when there is one. */
function StatusNote({ filter }: { filter: "needs" | "low" | "out" | "stale" }) {
  const [copied, setCopied] = useState(false);
  const copyLow = async () => {
    const low = await api<ItemSummary[]>("/items/low");
    const line = (i: ItemSummary) => {
      const status =
        i.tracking === "level"
          ? levelLabels[(["out", "low"] as const).find((l) => i.places.some((p) => p.level === l)) ?? "low"]
          : `${i.totalQty ?? 0} left${i.lowThreshold !== null ? ` (warn at ${i.lowThreshold})` : ""}`;
      return `- ${itemName(i.name)}: ${status}`;
    };
    await navigator.clipboard.writeText(low.map(line).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const link = "inline-flex min-h-9 shrink-0 items-center gap-1 text-accent";
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
      {filter === "needs" && <span>Added quickly. Open one to fill in what it is.</span>}
      {filter === "low" && (
        <>
          <span>Marked low or out, or at or below the warning count set on the part.</span>
          <button onClick={copyLow} className={link}>
            <Copy size={14} /> {copied ? "Copied" : "Copy as a shopping list"}
          </button>
        </>
      )}
      {filter === "out" && (
        <>
          <span>Stickered parts that are out right now.</span>
          <Link to="/out" className={link}>
            Where they went <ChevronRight size={14} />
          </Link>
        </>
      )}
      {filter === "stale" && (
        <>
          <span>Counts that are old, or changed a lot since they were counted.</span>
          <Link to="/review" className={link}>
            Check them one by one <ChevronRight size={14} />
          </Link>
        </>
      )}
    </p>
  );
}

/** The place to show first: its home if it has stock there, else the first place with stock. */
const mainPlace = (item: ItemSummary) => {
  const stocked = item.places.filter((p) => p.hasStock);
  return stocked.find((p) => p.isHome) ?? stocked[0];
};

function StatusBadges({ item }: { item: ItemSummary }) {
  return (
    <>
      {item.needsDetails && <Badge tone="warn">needs details</Badge>}
      {item.checkedOut > 0 && <Badge tone="info">{item.checkedOut} out</Badge>}
    </>
  );
}

function Places({ item, max }: { item: ItemSummary; max: number }) {
  if (item.places.length === 0) return <span className="block text-[13px] text-muted">No location</span>;
  return (
    <>
      {item.places.slice(0, max).map((p) => (
        <PlacePath key={p.locationId} path={p.path} className="text-[13px] text-muted" after={p.out && <span className="text-info"> · {outText(p.out)}</span>} />
      ))}
      {item.places.length > max && <span className="block text-[13px] text-muted">+{item.places.length - max} more place{item.places.length - max === 1 ? "" : "s"}</span>}
    </>
  );
}

// Columns line up across rows on wide screens: thumb · name · category · where · count · chevron.
const nameCol = "min-w-0 flex-1 lg:flex-[2]";
const catCol = "hidden w-40 shrink-0 truncate text-[13px] text-muted lg:block";
const whereCol = "hidden min-w-0 flex-[2] lg:block";
const countCol = "flex shrink-0 justify-end lg:w-40";

function ListView({ pinned, items }: { pinned: ItemSummary[]; items: ItemSummary[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="hidden items-center gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted lg:flex" aria-hidden>
        <span className="w-12 shrink-0" />
        <span className={nameCol}>Name</span>
        <span className="w-40 shrink-0">Category</span>
        <span className="min-w-0 flex-[2]">Where</span>
        <span className="w-40 shrink-0 text-right">Count</span>
        <span className="w-[18px] shrink-0" />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {pinned.map((i) => (
          <PinnedRow key={i.id} item={i} />
        ))}
        {items.map((i) => (
          <li key={i.id}>
            <Link to={`/items/${i.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-surface-2 lg:hover:bg-surface-2">
              <Thumb url={i.thumbUrl} />
              <RowText item={i} />
              <span className={catCol}>{i.categoryName ?? ""}</span>
              <span className={whereCol}>
                <Places item={i} max={2} />
              </span>
              <span className={countCol}>
                <ItemTotal item={i} />
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowText({ item: i, pinned }: { item: ItemSummary; pinned?: boolean }) {
  const place = pinned ? mainPlace(i) : undefined;
  return (
    <span className={nameCol}>
      <span className="flex items-center gap-1.5">
        {pinned && <Pin size={14} className="shrink-0 text-warn" aria-label="Pinned" />}
        <span className={`truncate ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
        {/* Phone: a pencil, like the one on the "Needs details" filter, so the place keeps the room. */}
        {i.needsDetails && <PencilLine size={14} className="shrink-0 text-warn lg:hidden" aria-label="Needs details" />}
      </span>
      {/* Phone: where it is (wide screens have a column for that). A pinned row only has room for the bin. */}
      <span className="flex min-w-0 items-center gap-1.5 lg:hidden">
        {i.checkedOut > 0 && <Badge tone="info">{i.checkedOut} out</Badge>}
        <span className="min-w-0 flex-1">
          {pinned ? (
            <span className="block truncate text-[13px] text-muted">
              {place ? place.path.at(-1)?.name : i.places.length ? i.places[0]!.path.at(-1)?.name : "No location"}
              {place?.out && <span className="text-info"> (out)</span>}
              {i.places.length > 1 && ` +${i.places.length - 1}`}
            </span>
          ) : (
            <Places item={i} max={i.checkedOut > 0 ? 1 : 2} />
          )}
        </span>
      </span>
      {(i.needsDetails || i.checkedOut > 0) && (
        <span className="hidden gap-1.5 pt-0.5 lg:flex">
          <StatusBadges item={i} />
        </span>
      )}
    </span>
  );
}

/** A pinned part keeps its − / + right in the list, for the place you take it from. */
function PinnedRow({ item }: { item: ItemSummary }) {
  const place = mainPlace(item);
  const placeName = place?.path.at(-1)?.name ?? "";
  const control = (compact: boolean) =>
    place ? (
      <StockControl compact={compact} itemId={item.id} locationId={place.locationId} placeName={placeName} tracking={item.tracking} qty={place.qty} level={place.level} />
    ) : (
      <ItemTotal item={item} />
    );
  const level = place && item.tracking === "level";
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Link to={`/items/${item.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
          <Thumb url={item.thumbUrl} />
          <RowText item={item} pinned />
          <span className={catCol}>{item.categoryName ?? ""}</span>
          <span className={whereCol}>
            <Places item={item} max={2} />
          </span>
        </Link>
        <span className={`${countCol} ${level ? "hidden lg:flex" : ""}`}>{control(true)}</span>
        <span className="hidden w-[18px] shrink-0 lg:block" />
      </div>
      {level && <div className="lg:hidden">{control(true)}</div>}
    </li>
  );
}

function TileView({ pinned, items }: { pinned: ItemSummary[]; items: ItemSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {pinned.map((i) => (
        <Tile key={i.id} item={i} pinned />
      ))}
      {items.map((i) => (
        <Tile key={i.id} item={i} />
      ))}
    </ul>
  );
}

function Tile({ item: i, pinned }: { item: ItemSummary; pinned?: boolean }) {
  const place = mainPlace(i) ?? i.places[0];
  const where = place ? (place.path.at(-1)?.name ?? "") + (place.out ? " (out)" : "") + (i.places.length > 1 ? ` +${i.places.length - 1}` : "") : "No location";
  return (
    <li>
      <Link to={`/items/${i.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface active:bg-surface-2 lg:hover:bg-surface-2">
        <span className="relative block aspect-square bg-surface-2">
          {i.thumbUrl ? (
            <img src={i.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-muted">
              <ImageOff size={32} />
            </span>
          )}
          {pinned && (
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-warn">
              <Pin size={14} aria-label="Pinned" />
            </span>
          )}
          {(i.needsDetails || i.checkedOut > 0) && (
            <span className="absolute bottom-2 left-2 flex gap-1">
              {i.needsDetails && <span className="rounded-md bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-warn">needs details</span>}
              {i.checkedOut > 0 && <span className="rounded-md bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-info">{i.checkedOut} out</span>}
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-2.5">
          <span className={`line-clamp-2 text-sm font-medium leading-snug ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
          <span className="mt-auto flex items-center justify-between gap-2 text-[13px] text-muted">
            <span className="min-w-0 truncate">{where}</span>
            <ItemTotal item={i} small />
          </span>
          {i.categoryName && <span className="truncate text-xs text-muted">{i.categoryName}</span>}
        </span>
      </Link>
    </li>
  );
}
