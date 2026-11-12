import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  itemKindLabels,
  itemKinds,
  trackingLabels,
  trackingModes,
  type Category,
  type CategoryValues,
  type ItemDetail,
  type ItemKind,
  type Place,
  type StockLevel,
  type StockResult,
  type TrackingMode,
  type UpdateItem,
  type AiFill,
  type Suggestion,
} from "../../shared/api";
import { api } from "../api";
import { CategoryPicker, useCreateCategory } from "../components/CategoryPicker";
import { LevelButtons } from "../components/StockControl";
import { useToast } from "../components/Toast";
import { Button, Field, inputClass, itemName, PlacePath, Thumb } from "../components/ui";
import { AiSuggestions, useAiStatus } from "../components/AiSuggestions";

/** An amount as the form holds it: a typed count ("" = not counted) or a level. */
type Amount = string;

/** What the server does to a place's stock when the item switches how it's counted (items.ts). */
function convertAmount(v: Amount, to: TrackingMode): Amount {
  if (to === "level") return v === "0" ? "out" : "plenty";
  return v === "out" ? "0" : "";
}
const amountOf = (p: Place, tracking: TrackingMode): Amount => (tracking === "level" ? (p.level ?? "plenty") : (p.qty?.toString() ?? ""));

export function ItemEditPage() {
  const id = Number(useParams().id);
  const { data: item } = useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  if (!item || !categories) return <p className="text-muted">Loading…</p>;
  return <ItemForm item={item} categories={categories} />;
}

/**
 * The part's details form. On its own page it goes back when done; inside the Needs details
 * page's popup (DEC-037) it calls onClose instead.
 */
export function ItemForm({
  item,
  categories,
  onClose,
  onDeleted,
}: {
  item: ItemDetail;
  categories: Category[];
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const createCategory = useCreateCategory();
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState<number | null>(item.categoryId);
  const [kind, setKind] = useState<ItemKind>(item.kind);
  const [tracking, setTracking] = useState<TrackingMode>(item.tracking);
  const [touched, setTouched] = useState({ kind: false, tracking: false });
  const [attrs, setAttrs] = useState<[string, string][]>(Object.entries(item.attributes));
  const [price, setPrice] = useState(item.price?.toString() ?? "");
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [supplierPn, setSupplierPn] = useState(item.supplierPn ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [lowThreshold, setLowThreshold] = useState(item.lowThreshold?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  // AI data fill (DEC-048): which fields hold a value the AI suggested, and where it came from.
  // Typing in one of those fields by hand takes the mark off.
  const [aiFields, setAiFields] = useState<Record<string, AiFill>>(item.aiFields ?? {});
  const ai = useAiStatus();
  const byHand = (field: string) =>
    setAiFields((f) => {
      if (!(field in f)) return f;
      const { [field]: _gone, ...rest } = f;
      return rest;
    });
  const useSuggestion = (s: Suggestion) => {
    const at = new Date().toISOString();
    if (s.field === "name") setName(s.value);
    else if (s.field === "category") {
      const c = categories.find((x) => x.name === s.value);
      if (!c) return;
      setCategoryId(c.id);
    } else if (s.field === "supplier") setSupplier(s.value);
    else if (s.field === "supplierPn") setSupplierPn(s.value);
    else if (s.field === "price") setPrice(s.value);
    else if (s.field === "url") setUrl(s.value);
    else if (s.field.startsWith("attributes.")) setValue(s.field.slice(11), s.value);
    else return;
    setAiFields((f) => ({ ...f, [s.field]: { source: s.source, at } }));
  };
  // How much is in each place (bulk stock only; stickered units count themselves).
  const stocked = item.places.filter((p) => p.hasStock);
  const [amounts, setAmounts] = useState<Record<number, Amount>>(() => Object.fromEntries(stocked.map((p) => [p.locationId, amountOf(p, item.tracking)])));
  const [changed, setChanged] = useState<number[]>([]);
  const setAmount = (locationId: number, v: Amount) => {
    setAmounts((a) => ({ ...a, [locationId]: v }));
    setChanged((c) => (c.includes(locationId) ? c : [...c, locationId]));
  };
  // Switching how it's counted shows what the stock will become; amounts typed here convert the same way.
  const switchTracking = (to: TrackingMode) => {
    if (to === tracking) return;
    setAmounts(
      Object.fromEntries(
        stocked.map((p) => {
          const v = changed.includes(p.locationId) ? convertAmount(amounts[p.locationId] ?? "", to) : to === item.tracking ? amountOf(p, to) : convertAmount(amountOf(p, item.tracking), to);
          return [p.locationId, v];
        }),
      ),
    );
    setTracking(to);
  };

  const category = categories.find((c) => c.id === categoryId);

  // Picking a category fills in its defaults, unless they were changed by hand.
  // (Not on first render: an existing item keeps what it has.)
  const initialCategory = useRef(categoryId);
  useEffect(() => {
    if (!category || categoryId === initialCategory.current) return;
    if (!touched.kind) setKind(category.defaultKind);
    if (!touched.tracking) switchTracking(category.defaultTracking);
  }, [categoryId]);

  // Category fields first (in order), then any extra fields.
  const fieldKeys = category?.fieldDefs.map((f) => f.key) ?? [];
  const listId = useId();
  const { data: used } = useQuery({
    queryKey: ["categories", category?.id, "values"],
    queryFn: () => api<CategoryValues>(`/categories/${category!.id}/values`),
    enabled: !!category && category.fieldDefs.some((f) => f.type !== "choice"),
  });
  const value = (key: string) => attrs.find(([k]) => k === key)?.[1] ?? "";
  const setValue = (key: string, v: string) =>
    setAttrs((a) => (a.some(([k]) => k === key) ? a.map(([k, old]) => [k, k === key ? v : old]) : [...a, [key, v]]));
  const extras = attrs.map(([k], i) => [k, i] as const).filter(([k]) => !fieldKeys.includes(k));

  const save = useMutation({
    mutationFn: async () => {
      const body: UpdateItem = {
        name: name.trim(),
        categoryId,
        kind,
        tracking,
        attributes: Object.fromEntries(attrs.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()])),
        price: price.trim() ? Number(price) : null,
        supplier: supplier.trim() || null,
        supplierPn: supplierPn.trim() || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
        lowThreshold: tracking === "exact" && lowThreshold.trim() ? Number(lowThreshold) : null,
        aiFields,
      };
      let saved = await api<ItemDetail>(`/items/${item.id}`, { method: "PATCH", body });
      // Then the amounts that were changed here, each a recount (in the log, undoable from Activity).
      for (const p of stocked) {
        if (!changed.includes(p.locationId)) continue;
        const v = amounts[p.locationId] ?? "";
        const now = saved.places.find((x) => x.locationId === p.locationId);
        if (tracking === "exact") {
          if (v === "" || Number(v) === now?.qty) continue;
          saved = (await api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: p.locationId, qty: Number(v) } })).item;
        } else {
          if (v === now?.level) continue;
          saved = (await api<StockResult>("/stock/recount", { method: "POST", body: { itemId: item.id, locationId: p.locationId, level: v as StockLevel } })).item;
        }
      }
      return saved;
    },
    onSuccess: (d) => {
      qc.setQueryData(["item", d.id], d);
      for (const key of ["items", "categories", "stats", "location", "pins", "events", "review", "low"]) qc.invalidateQueries({ queryKey: [key] });
      toast.show({ message: `Saved ${itemName(d.name)}` });
      if (onClose) return onClose();
      // Back to wherever the form was opened from (the part, a bin, the needs-details list),
      // so Back afterwards doesn't land on the same part again. Opened directly: show the part.
      if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
      else navigate(`/items/${d.id}`, { replace: true });
    },
    onError: (e: Error) => setError(e.message),
  });

  // Soft delete: hidden everywhere, history kept, undoable from the toast.
  const remove = useMutation({
    mutationFn: () => api<{ eventId: number }>(`/items/${item.id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      if (onDeleted) onDeleted();
      else navigate("/", { replace: true });
      // Drop the deleted item's own query rather than refetching it (it would 404 now).
      qc.removeQueries({ queryKey: ["item", item.id] });
      qc.invalidateQueries();
      toast.show({ message: `Deleted ${itemName(item.name)}`, undoEventId: r.eventId });
    },
    onError: (e: Error) => setError(e.message),
  });
  const confirmRemove = () => {
    if (window.confirm(`Delete ${itemName(item.name)}? Its history is kept and you can undo right after.`)) remove.mutate();
  };

  const priceOk = price.trim() === "" || (Number.isFinite(Number(price)) && Number(price) >= 0);
  const canSave = name.trim().length > 0 && priceOk;
  const cancel = () => (onClose ? onClose() : navigate(-1));

  return (
    <form
      // On a phone one column with Save at the bottom; with room (the desktop page, the wide popup)
      // two columns, what it is on the left and its details on the right, Save beside the title.
      className="@container flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-5xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <Thumb url={item.thumbUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{item.needsDetails ? "Fill in details" : "Edit item"}</h1>
          {onClose && (
            <Link to={`/items/${item.id}`} className="text-sm text-accent">
              Open the part's page (photos, places, history)
            </Link>
          )}
        </div>
        <div className="hidden items-center gap-2 @3xl:flex">
          <Button type="button" onClick={cancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!canSave || save.isPending} className="min-w-28">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center text-muted" aria-label="Close">
            <X size={22} />
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      {ai?.enabled && (
        <AiSuggestions item={item} form={{ name, url, supplier, supplierPn }} used={aiFields} onUse={useSuggestion} />
      )}

      <div className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-2 @3xl:items-start @3xl:gap-x-10">
      <div className="flex flex-col gap-4">
      <Field label="Name">
        <input value={name} onChange={(e) => { setName(e.target.value); byHand("name"); }} className={inputClass} placeholder="e.g. M3 × 10 socket cap screw" autoFocus={!item.name} />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Category</span>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(c) => { setCategoryId(c?.id ?? null); byHand("category"); }}
          onCreate={(n) => createCategory(n, { defaultKind: kind, defaultTracking: tracking })}
          allowNone
        />
        {!categoryId && <span className="text-[13px] text-warn">Without a category it stays on the Needs details list.</span>}
        <Link to="/categories" className="self-start text-[13px] text-accent">Manage categories and their fields</Link>
      </div>

      <Segmented
        label="Type"
        value={kind}
        options={itemKinds.map((k) => [k, itemKindLabels[k]])}
        onChange={(v) => {
          setKind(v);
          setTouched((t) => ({ ...t, kind: true }));
        }}
        hint={kind === "returnable" ? "Comes back after use (tools, modules, power supplies)" : "Used up (screws, parts, glue)"}
      />
      <Segmented
        label="Keep track by"
        value={tracking}
        options={trackingModes.map((t) => [t, trackingLabels[t]])}
        onChange={(v) => {
          switchTracking(v);
          setTouched((t) => ({ ...t, tracking: true }));
        }}
        hint={tracking !== item.tracking ? "What's there now converts when you save (shown below)" : undefined}
      />

      <Amounts item={item} stocked={stocked} tracking={tracking} amounts={amounts} onChange={setAmount} />

      {tracking === "exact" ? (
        <Field label="Warn me when it's down to">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={lowThreshold}
            onChange={(e) => setLowThreshold(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} w-40`}
            placeholder="No warning"
            aria-label="Warn me when it's down to: on the shopping list when the total is at or below this"
          />
          <span className="text-[13px] text-muted">It goes on the shopping list when the total is at or below this. Leave it blank for no warning.</span>
        </Field>
      ) : (
        <p className="text-[13px] text-muted">No warning number needed: marking it Low or Out puts it on the shopping list.</p>
      )}
      </div>

      <div className="flex flex-col gap-4">
      {category && category.fieldDefs.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{category.name} fields</legend>
          <div className="grid grid-cols-2 gap-3">
            {category.fieldDefs.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "choice" ? (
                  <select value={value(f.key)} onChange={(e) => { setValue(f.key, e.target.value); byHand(`attributes.${f.key}`); }} className={inputClass}>
                    <option value=""></option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {/* A value from before the field became a choice stays until it's changed (DEC-059). */}
                    {value(f.key) && !(f.options ?? []).includes(value(f.key)) && <option value={value(f.key)}>{value(f.key)} (not in the list)</option>}
                  </select>
                ) : (
                  <>
                    <input value={value(f.key)} onChange={(e) => { setValue(f.key, e.target.value); byHand(`attributes.${f.key}`); }} className={inputClass} list={`${listId}-${f.key}`} autoComplete="off" />
                    {/* Values other parts of this kind already hold, offered as you type (DEC-060). */}
                    <datalist id={`${listId}-${f.key}`}>
                      {(used?.[f.key] ?? []).map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Other fields</legend>
        {extras.map(([, i]) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label="Field name"
              value={attrs[i]![0]}
              onChange={(e) => setAttrs((a) => a.map((row, j) => (j === i ? [e.target.value, row[1]] : row)))}
              className={`${inputClass} w-2/5`}
              placeholder="Field"
            />
            <input
              aria-label="Value"
              value={attrs[i]![1]}
              onChange={(e) => setAttrs((a) => a.map((row, j) => (j === i ? [row[0], e.target.value] : row)))}
              className={`${inputClass} min-w-0 flex-1`}
              placeholder="Value"
            />
            <button type="button" onClick={() => setAttrs((a) => a.filter((_, j) => j !== i))} className="flex min-h-11 w-11 items-center justify-center text-muted" aria-label="Remove field">
              <X size={18} />
            </button>
          </div>
        ))}
        <Button type="button" variant="ghost" className="self-start" onClick={() => setAttrs((a) => [...a, ["", ""]])}>
          <Plus size={18} /> Add field
        </Button>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price">
          <input inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); byHand("price"); }} className={inputClass} placeholder="0.00" />
        </Field>
        <Field label="Supplier">
          <input value={supplier} onChange={(e) => { setSupplier(e.target.value); byHand("supplier"); }} className={inputClass} placeholder="DigiKey, Amazon…" />
        </Field>
      </div>
      <Field label="Supplier part #">
        <input value={supplierPn} onChange={(e) => { setSupplierPn(e.target.value); byHand("supplierPn"); }} className={`${inputClass} font-mono`} />
      </Field>
      <Field label="Link">
        <input type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); byHand("url"); }} className={inputClass} placeholder="https://" />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} py-2`} />
      </Field>
      </div>
      </div>

      <div className="flex gap-2 @3xl:hidden">
        <Button type="submit" variant="primary" disabled={!canSave || save.isPending} className="flex-1">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" onClick={cancel}>Cancel</Button>
      </div>
      <Button type="button" variant="danger" onClick={confirmRemove} disabled={remove.isPending} className="mt-6 self-start">
        <Trash2 size={18} /> Delete item
      </Button>
    </form>
  );
}

/** How much is in each place, set from the form and saved with it. */
function Amounts({
  item,
  stocked,
  tracking,
  amounts,
  onChange,
}: {
  item: ItemDetail;
  stocked: Place[];
  tracking: TrackingMode;
  amounts: Record<number, Amount>;
  onChange: (locationId: number, v: Amount) => void;
}) {
  const unitsOnly = item.places.filter((p) => !p.hasStock && p.units > 0);
  return (
    <section className="flex flex-col gap-2" aria-label="How many">
      <span className="text-[13px] text-muted">{tracking === "exact" ? "How many" : "How much is there"}</span>
      {item.places.length === 0 && <p className="text-[13px] text-muted">Not in a place yet. Add it to one from the part's page.</p>}
      {stocked.map((p) =>
        tracking === "exact" ? (
          <label key={p.locationId} className="flex items-center gap-3">
            <PlacePath path={p.path} className="flex-1 text-sm" />
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={amounts[p.locationId] ?? ""}
              onChange={(e) => onChange(p.locationId, e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} w-28 text-center font-mono`}
              placeholder="Not counted"
              aria-label={`How many in ${p.path.at(-1)?.name ?? "this place"}`}
            />
          </label>
        ) : (
          <div key={p.locationId} className="flex flex-col gap-1.5">
            <PlacePath path={p.path} className="text-sm" />
            <LevelButtons value={(amounts[p.locationId] ?? "plenty") as StockLevel} onPick={(l) => onChange(p.locationId, l)} compact label={`How much in ${p.path.at(-1)?.name ?? "this place"}`} />
          </div>
        ),
      )}
      {unitsOnly.map((p) => (
        <div key={p.locationId} className="flex items-center gap-3 text-sm">
          <PlacePath path={p.path} className="flex-1" />
          <span className="text-muted">{p.units} stickered</span>
        </div>
      ))}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-11 rounded-xl border px-3 text-sm ${value === v ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}
