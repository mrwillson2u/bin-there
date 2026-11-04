import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import {
  itemKindLabels,
  itemKinds,
  trackingLabels,
  trackingModes,
  type Category,
  type ItemDetail,
  type ItemKind,
  type TrackingMode,
  type UpdateItem,
} from "../../shared/api";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { Button, Field, inputClass, itemName, Thumb } from "../components/ui";

const NEW_CATEGORY = -1;

export function ItemEditPage() {
  const id = Number(useParams().id);
  const { data: item } = useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  if (!item || !categories) return <p className="text-muted">Loading…</p>;
  return <ItemForm item={item} categories={categories} />;
}

function ItemForm({ item, categories }: { item: ItemDetail; categories: Category[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState<number | null>(item.categoryId);
  const [newCategory, setNewCategory] = useState("");
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

  const category = categories.find((c) => c.id === categoryId);

  // Picking a category fills in its defaults, unless they were changed by hand.
  // (Not on first render: an existing item keeps what it has.)
  const initialCategory = useRef(categoryId);
  useEffect(() => {
    if (!category || categoryId === initialCategory.current) return;
    if (!touched.kind) setKind(category.defaultKind);
    if (!touched.tracking) setTracking(category.defaultTracking);
  }, [categoryId]);

  // Category fields first (in order), then any extra fields.
  const fieldKeys = category?.fieldDefs.map((f) => f.key) ?? [];
  const value = (key: string) => attrs.find(([k]) => k === key)?.[1] ?? "";
  const setValue = (key: string, v: string) =>
    setAttrs((a) => (a.some(([k]) => k === key) ? a.map(([k, old]) => [k, k === key ? v : old]) : [...a, [key, v]]));
  const extras = attrs.map(([k], i) => [k, i] as const).filter(([k]) => !fieldKeys.includes(k));

  const save = useMutation({
    mutationFn: async () => {
      let catId = categoryId === NEW_CATEGORY ? null : categoryId;
      if (categoryId === NEW_CATEGORY && newCategory.trim()) {
        const created = await api<Category>("/categories", { method: "POST", body: { name: newCategory.trim(), defaultKind: kind, defaultTracking: tracking } });
        catId = created.id;
      }
      const body: UpdateItem = {
        name: name.trim(),
        categoryId: catId,
        kind,
        tracking,
        attributes: Object.fromEntries(attrs.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()])),
        price: price.trim() ? Number(price) : null,
        supplier: supplier.trim() || null,
        supplierPn: supplierPn.trim() || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
        lowThreshold: tracking === "exact" && lowThreshold.trim() ? Number(lowThreshold) : null,
      };
      return api<ItemDetail>(`/items/${item.id}`, { method: "PATCH", body });
    },
    onSuccess: (d) => {
      qc.setQueryData(["item", d.id], d);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["pins"] });
      toast.show({ message: `Saved ${itemName(d.name)}` });
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
      navigate("/", { replace: true });
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
  const canSave = name.trim().length > 0 && priceOk && (categoryId !== NEW_CATEGORY || newCategory.trim().length > 0);

  return (
    <form
      className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <Thumb url={item.thumbUrl} size={64} />
        <h1 className="text-xl font-semibold">{item.needsDetails ? "Fill in details" : "Edit item"}</h1>
      </div>

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. M3 × 10 socket cap screw" autoFocus={!item.name} />
      </Field>

      <Field label="Category">
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value === "" ? null : Number(e.target.value))}
          className={inputClass}
        >
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value={NEW_CATEGORY}>New category…</option>
        </select>
      </Field>
      {categoryId === NEW_CATEGORY && (
        <Field label="New category name">
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={inputClass} autoFocus />
        </Field>
      )}

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
        label="Count"
        value={tracking}
        options={trackingModes.map((t) => [t, trackingLabels[t]])}
        onChange={(v) => {
          setTracking(v);
          setTouched((t) => ({ ...t, tracking: true }));
        }}
        hint={tracking !== item.tracking ? "Existing stock will be converted when you save" : undefined}
      />

      {tracking === "exact" && (
        <Field label="Low-stock warning (leave blank for none)">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={lowThreshold}
            onChange={(e) => setLowThreshold(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} w-40`}
            placeholder="e.g. 20"
            aria-label="Low-stock warning: on the shopping list when the total is at or below this"
          />
          <span className="text-[13px] text-muted">Goes on the shopping list when the total is at or below this.</span>
        </Field>
      )}

      {category && category.fieldDefs.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{category.name} fields</legend>
          <div className="grid grid-cols-2 gap-3">
            {category.fieldDefs.map((f) => (
              <Field key={f.key} label={f.label}>
                <input value={value(f.key)} onChange={(e) => setValue(f.key, e.target.value)} className={inputClass} />
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
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="0.00" />
        </Field>
        <Field label="Supplier">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass} placeholder="DigiKey, Amazon…" />
        </Field>
      </div>
      <Field label="Supplier part #">
        <input value={supplierPn} onChange={(e) => setSupplierPn(e.target.value)} className={`${inputClass} font-mono`} />
      </Field>
      <Field label="Link">
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://" />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} py-2`} />
      </Field>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!canSave || save.isPending} className="flex-1">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" onClick={() => navigate(-1)}>Cancel</Button>
      </div>
      <Button type="button" variant="danger" onClick={confirmRemove} disabled={remove.isPending} className="mt-6 self-start">
        <Trash2 size={18} /> Delete item
      </Button>
    </form>
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
