import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { trackingLabels, trackingModes, type Category, type ItemDetail, type Place, type StockResult, type TrackingMode, type UpdateItem } from "../../shared/api";
import { api } from "../api";
import { CategoryPicker, useCreateCategory } from "../components/CategoryPicker";
import { StockControl, useStockMutation } from "../components/StockControl";
import { useToast } from "../components/Toast";
import { inputClass, itemName, PlacePath, Thumb } from "../components/ui";
import { ItemForm } from "./ItemEditPage";

// Fill in details (DEC-037): every part on the Needs details list on one page, each a row you
// can fill in where it is: name, category (type to find it), how it's counted, and how many.
// Each change saves as you go. A part that's done stays on screen with a tick until you leave.

const fetchItem = (id: number) => api<ItemDetail>(`/items/${id}`);

export function NeedsDetailsPage() {
  const qc = useQueryClient();
  const { data: ids } = useQuery({
    queryKey: ["needs-details"],
    queryFn: async () => {
      const list = await api<ItemDetail[]>("/items/needs-details");
      // Each row reads its part from the same place the part's own page does.
      for (const d of list) qc.setQueryData(["item", d.id], d);
      return list.map((d) => d.id);
    },
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });

  // Parts stay in the order first seen, done or not, so rows don't jump while you work.
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => {
    if (ids) setOrder((o) => [...o, ...ids.filter((i) => !o.includes(i))]);
  }, [ids]);
  const [gone, setGone] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [viewing, setViewing] = useState<ItemDetail | null>(null);

  const shown = order.filter((id) => !gone.includes(id));
  const rows = useQueries({
    queries: shown.map((id) => ({ queryKey: ["item", id], queryFn: () => fetchItem(id), staleTime: 60_000, retry: false })),
  });
  const items = rows.flatMap((r) => (r.data && !r.error ? [r.data] : []));
  const left = items.filter((i) => i.needsDetails).length;
  const editItem = items.find((i) => i.id === editing);

  if (!ids || !categories) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-6xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Fill in details</h1>
        {shown.length > 0 && (
          <p className="text-[13px] text-muted" aria-live="polite">
            {left === 0 ? "All done." : `${left} to go.`} Changes save as you go. A part is done once it has a name and a category.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-1 py-6 text-center text-muted">
          Nothing needs details right now. Parts you add quickly land here.{" "}
          <Link to="/capture" className="text-accent">Add one</Link>
        </p>
      ) : (
        <>
          <div aria-hidden className="hidden px-3 text-[13px] text-muted lg:grid lg:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,1.1fr)_44px] lg:gap-3">
            <span />
            <span>Name</span>
            <span>Category</span>
            <span>Keep track by, and how many</span>
            <span />
          </div>
          <ul className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-border lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:bg-surface">
            {items.map((item) => (
              <FillRow key={item.id} item={item} categories={categories} onMore={() => setEditing(item.id)} onPhoto={() => setViewing(item)} />
            ))}
          </ul>
        </>
      )}

      {editItem && (
        <Popup label={`Details for ${itemName(editItem.name)}`} onClose={() => setEditing(null)}>
          <ItemForm
            item={editItem}
            categories={categories}
            onClose={() => setEditing(null)}
            onDeleted={() => {
              setGone((g) => [...g, editItem.id]);
              setEditing(null);
            }}
          />
        </Popup>
      )}
      {viewing && <PhotoView item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function FillRow({ item, categories, onMore, onPhoto }: { item: ItemDetail; categories: Category[]; onMore: () => void; onPhoto: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const createCategory = useCreateCategory();
  const [name, setName] = useState(item.name);
  useEffect(() => {
    setName(item.name);
  }, [item.name]);
  // Once you pick how it's counted here, a category doesn't change it.
  const trackingSet = useRef(false);

  const patch = useMutation({
    mutationFn: (body: UpdateItem) => api<ItemDetail>(`/items/${item.id}`, { method: "PATCH", body }),
    onSuccess: (d) => {
      qc.setQueryData(["item", d.id], d);
      for (const key of ["items", "stats", "location", "pins"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => {
      setName(item.name);
      toast.show({ message: e.message, tone: "error" });
    },
  });

  const saveName = () => {
    const n = name.trim();
    if (!n) return setName(item.name);
    if (n !== item.name) patch.mutate({ name: n });
  };

  const pickCategory = (c: Category | null) => {
    if (!c) return;
    const body: UpdateItem = { categoryId: c.id };
    // The category's usual way of counting, unless that would throw away a count typed here.
    const counted = item.tracking === "exact" && item.places.some((p) => p.qty !== null);
    if (!trackingSet.current && c.defaultTracking !== item.tracking && !counted) body.tracking = c.defaultTracking;
    // A part with its own sticker stays returnable.
    if (c.defaultKind !== item.kind && item.unitList.length === 0) body.kind = c.defaultKind;
    patch.mutate(body);
  };

  const done = !item.needsDetails;
  return (
    <li
      aria-label={`${itemName(item.name)}${done ? ", done" : ""}`}
      className={`flex flex-col gap-2.5 rounded-2xl border bg-surface p-3 lg:grid lg:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,1.1fr)_44px] lg:items-start lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent ${
        done ? "border-ok/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3 lg:contents">
        <div className="relative shrink-0">
          {item.photos.length > 0 ? (
            <button type="button" onClick={onPhoto} aria-label={`Show the photo of ${itemName(item.name)}`} className="block rounded-lg">
              <Thumb url={item.thumbUrl} size={56} />
            </button>
          ) : (
            <Thumb url={null} size={56} />
          )}
          {done && (
            <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ok text-white ring-2 ring-surface" title="Done">
              <Check size={15} strokeWidth={3} />
            </span>
          )}
        </div>
        <input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(item.name);
          }}
          enterKeyHint="next"
          placeholder="What is it?"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={onMore}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted lg:order-last"
          aria-label={`More details for ${itemName(item.name)}`}
          title="More details"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      <CategoryPicker
        categories={categories}
        value={item.categoryId}
        onChange={pickCategory}
        onCreate={(n) => createCategory(n, { defaultKind: item.kind, defaultTracking: item.tracking })}
        label={`Category for ${itemName(item.name)}`}
      />

      <div className="flex flex-col gap-2.5">
        <TrackingToggle
          value={item.tracking}
          onChange={(t) => {
            trackingSet.current = true;
            if (t !== item.tracking) patch.mutate({ tracking: t });
          }}
        />
        {item.places.length === 0 && <p className="text-sm text-muted">Not in a place yet</p>}
        {item.places.map((p) => (
          <PlaceAmount key={p.locationId} item={item} place={p} />
        ))}
      </div>
    </li>
  );
}

function TrackingToggle({ value, onChange }: { value: TrackingMode; onChange: (t: TrackingMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Keep track by">
      {trackingModes.map((t) => (
        <button
          type="button"
          key={t}
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={`min-h-11 rounded-xl border px-2 text-sm leading-tight ${value === t ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2"}`}
        >
          {trackingLabels[t]}
        </button>
      ))}
    </div>
  );
}

/** How much is in one place: a number you type, or Plenty / Low / Out. Saves straight away, with Undo. */
function PlaceAmount({ item, place }: { item: ItemDetail; place: Place }) {
  const placeName = place.path.at(-1)?.name ?? "this place";
  // Where it is helps tell what it is, so the place is always shown.
  const where = <PlacePath path={place.path} className="min-w-0 flex-1 text-[13px] text-muted" />;
  if (!place.hasStock) {
    return (
      <div className="flex min-h-11 items-center gap-2">
        {where}
        <span className="shrink-0 text-sm text-muted">{place.units} stickered</span>
      </div>
    );
  }
  if (item.tracking === "level") {
    return (
      <div className="flex flex-col gap-1">
        {where}
        <StockControl itemId={item.id} locationId={place.locationId} placeName={placeName} tracking="level" qty={null} level={place.level} compact />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {where}
      <CountBox item={item} place={place} placeName={placeName} />
    </div>
  );
}

function CountBox({ item, place, placeName }: { item: ItemDetail; place: Place; placeName: string }) {
  const handlers = useStockMutation();
  const [draft, setDraft] = useState(place.qty?.toString() ?? "");
  useEffect(() => {
    setDraft(place.qty?.toString() ?? "");
  }, [place.qty]);
  const recount = useMutation({
    mutationFn: (n: number) => api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: place.locationId, qty: n } }),
    ...handlers((_, n: number) => `${itemName(item.name)}: ${n} in ${placeName}`),
  });
  const commit = () => {
    if (draft === "") return setDraft(place.qty?.toString() ?? "");
    const n = Number(draft);
    if (n !== place.qty) recount.mutate(n);
  };
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      aria-label={`How many ${itemName(item.name)} in ${placeName}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="How many?"
      className={`${inputClass} w-28 shrink-0 text-center font-mono placeholder:font-sans`}
    />
  );
}

/** The details form over the list: full screen on a phone, a centred panel on a computer. */
function Popup({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex lg:items-center lg:justify-center lg:p-[5vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative h-full w-full overflow-y-auto bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] lg:h-auto lg:max-h-full lg:w-[60rem] lg:max-w-full lg:rounded-2xl lg:border lg:border-border lg:p-6"
      >
        {children}
      </div>
    </div>
  );
}

function PhotoView({ item, onClose }: { item: ItemDetail; onClose: () => void }) {
  const photo = item.photos[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-label={`Photo of ${itemName(item.name)}`} className="fixed inset-0 z-50 flex flex-col bg-black" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-2 top-[calc(0.5rem+env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center text-white" aria-label="Close">
        <X size={24} />
      </button>
      {photo && <img src={photo.url} alt={itemName(item.name)} className="m-auto max-h-full max-w-full object-contain" />}
    </div>
  );
}
