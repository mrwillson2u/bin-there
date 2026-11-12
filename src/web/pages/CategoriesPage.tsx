import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Tags, Trash2, X } from "lucide-react";
import { itemKindLabels, itemKinds, trackingLabels, trackingModes, type Category, type CategoryUsage, type UpdateCategory } from "../../shared/api";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { Button, inputClass } from "../components/ui";

// Categories (DEC-056): the list, and for each one its name, its usual kind and way of counting,
// and its fields to add, rename, reorder and remove. Changes save as you go. A field keeps its
// hidden key when renamed, so every part's value stays attached; a removed field's values stay
// stored on the parts, unseen, and come back if the field is added again under the same name.
// A category parts still use can't be deleted (bulk editing moves them).

export function CategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const { data: usage } = useQuery({ queryKey: ["categories", "usage"], queryFn: () => api<Record<number, CategoryUsage>>("/categories/usage") });
  const [newName, setNewName] = useState("");
  const add = useMutation({
    mutationFn: (name: string) => api<Category>("/categories", { method: "POST", body: { name } }),
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  if (!categories || !usage) return <p className="text-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-5xl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Tags size={22} className="text-accent" /> Categories
        </h1>
        <p className="text-[13px] text-muted">
          Each category has its usual way of counting and its own fields, the details a part of that kind carries. Changes save as you go and apply to
          every part in the category.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate(newName.trim());
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputClass} min-w-0 flex-1`} placeholder="New category, e.g. Relays" aria-label="New category" />
        <Button type="submit" disabled={!newName.trim() || add.isPending}>
          <Plus size={18} /> Add
        </Button>
      </form>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
        {categories.map((c) => (
          <CategoryCard key={c.id} category={c} usage={usage[c.id] ?? { items: 0, fields: {} }} />
        ))}
      </div>
      <p className="text-[13px] text-muted">
        Parts are given a category on their form or on <Link to="/needs-details" className="text-accent">Fill in details</Link>.
      </p>
    </div>
  );
}

function CategoryCard({ category: c, usage }: { category: Category; usage: CategoryUsage }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries(c.fieldDefs.map((f) => [f.key, f.label])));
  const [newField, setNewField] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (body: UpdateCategory) => api<Category>(`/categories/${c.id}`, { method: "PATCH", body }),
    onSuccess: (updated) => {
      qc.setQueryData<Category[]>(["categories"], (old) => old?.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setLabels(Object.fromEntries(updated.fieldDefs.map((f) => [f.key, f.label])));
      for (const key of ["item", "items", "categories"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => {
      setName(c.name);
      toast.show({ message: e.message, tone: "error" });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/categories/${c.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  const fields = c.fieldDefs.map((f) => ({ key: f.key, label: labels[f.key] ?? f.label }));
  const saveFields = (next: { key?: string; label: string }[]) => patch.mutate({ fieldDefs: next });
  const move = (i: number, by: number) => {
    const next = [...fields];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    saveFields(next);
  };
  const removeField = (key: string) => {
    const held = usage.fields[key] ?? 0;
    if (held > 0 && confirmRemove !== key) return setConfirmRemove(key);
    setConfirmRemove(null);
    saveFields(fields.filter((f) => f.key !== key));
  };
  const addField = () => {
    const label = newField.trim();
    if (!label) return;
    setNewField("");
    saveFields([...fields, { label }]);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-category={c.name} aria-label={`Category ${c.name}`}>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (!n) return setName(c.name);
            if (n !== c.name) patch.mutate({ name: n });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={`${inputClass} min-w-0 flex-1 font-semibold`}
          aria-label={`Name of ${c.name}`}
        />
        <span className="shrink-0 text-[13px] text-muted">{usage.items === 1 ? "1 part" : `${usage.items} parts`}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Choices label={`Usual type for ${c.name}`} options={itemKinds} labels={itemKindLabels} value={c.defaultKind} onPick={(v) => patch.mutate({ defaultKind: v })} />
        <Choices label={`Usual way of counting for ${c.name}`} options={trackingModes} labels={trackingLabels} value={c.defaultTracking} onPick={(v) => patch.mutate({ defaultTracking: v })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">Fields</span>
        {fields.length === 0 && <p className="text-sm text-muted">No fields yet. A field is a detail every part of this kind has, like Voltage or Thread.</p>}
        <ul className="flex flex-col gap-1.5">
          {fields.map((f, i) => (
            <li key={f.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input
                  value={f.label}
                  onChange={(e) => setLabels((l) => ({ ...l, [f.key]: e.target.value }))}
                  onBlur={() => {
                    const label = (labels[f.key] ?? "").trim();
                    if (!label) return setLabels((l) => ({ ...l, [f.key]: c.fieldDefs.find((d) => d.key === f.key)?.label ?? "" }));
                    if (label !== c.fieldDefs.find((d) => d.key === f.key)?.label) saveFields(fields.map((x) => (x.key === f.key ? { ...x, label } : x)));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className={`${inputClass} min-w-0 flex-1`}
                  aria-label={`Field ${i + 1} of ${c.name}`}
                />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex h-10 w-9 items-center justify-center rounded-lg text-muted disabled:opacity-30" aria-label={`Move ${f.label} up`}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="flex h-10 w-9 items-center justify-center rounded-lg text-muted disabled:opacity-30" aria-label={`Move ${f.label} down`}>
                  <ArrowDown size={16} />
                </button>
                <button type="button" onClick={() => removeField(f.key)} className="flex h-10 w-9 items-center justify-center rounded-lg text-muted" aria-label={`Remove ${f.label} from ${c.name}`}>
                  <X size={16} />
                </button>
              </div>
              {confirmRemove === f.key && (
                <p className="rounded-lg bg-warn/10 px-3 py-2 text-[13px] text-warn" role="alert">
                  {usage.fields[f.key]} {usage.fields[f.key] === 1 ? "part has" : "parts have"} a value in {f.label}. Removing the field hides those values; they come back if
                  a field with this name is added again.{" "}
                  <button type="button" onClick={() => removeField(f.key)} className="font-semibold underline">
                    Remove anyway
                  </button>{" "}
                  <button type="button" onClick={() => setConfirmRemove(null)} className="underline">
                    Keep it
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            addField();
          }}
        >
          <input value={newField} onChange={(e) => setNewField(e.target.value)} className={`${inputClass} min-w-0 flex-1`} placeholder="Add a field, e.g. Voltage" aria-label={`New field for ${c.name}`} />
          <Button type="submit" variant="ghost" disabled={!newField.trim()}>
            <Plus size={18} /> Add
          </Button>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={usage.items > 0 || remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete the category ${c.name}?`)) remove.mutate();
          }}
          title={usage.items > 0 ? "Parts still use it: move them first" : undefined}
        >
          <Trash2 size={18} /> Delete category
        </Button>
        {usage.items > 0 && <span className="text-[13px] text-muted">Parts still use it; move them to another category first.</span>}
      </div>
    </section>
  );
}

function Choices<T extends string>({ label, options, labels, value, onPick }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o}
          role="radio"
          aria-checked={value === o}
          onClick={() => onPick(o)}
          className={`min-h-10 rounded-lg border px-2 text-[13px] leading-tight ${value === o ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2"}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
