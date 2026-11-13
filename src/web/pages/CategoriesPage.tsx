import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Tags, Trash2, X } from "lucide-react";
import { fieldTypeLabels, fieldTypes, itemKindLabels, itemKinds, trackingLabels, trackingModes, type Category, type CategoryUsage, type FieldDef, type UpdateCategory } from "../../shared/api";
import { bare, fieldName } from "../../shared/fields";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { Button, inputClass } from "../components/ui";

// Categories (DEC-056): the list, and for each one its name, its usual kind and way of counting,
// and its fields to add, rename, reorder and remove. Changes save as you go. A field keeps its
// hidden key when renamed, so every part's value stays attached; a removed field's values stay
// stored on the parts, unseen, and come back if the field is added again under the same name.
// A category parts still use can't be deleted (bulk editing moves them). A field is Text or
// Choice (DEC-059): a choice field lists its options, which the part's form offers in a drop-down
// and the AI picks from.

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
          <CategoryCard key={c.id} category={c} all={categories} usage={usage[c.id] ?? { items: 0, fields: {} }} />
        ))}
      </div>
      <p className="text-[13px] text-muted">
        Parts are given a category on their form or on <Link to="/needs-details" className="text-accent">Fill in details</Link>.
      </p>
    </div>
  );
}

function CategoryCard({ category: c, all, usage }: { category: Category; all: Category[]; usage: CategoryUsage }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries(c.fieldDefs.map((f) => [f.key, f.label])));
  // Options as typed, one line of commas per choice field; saved on blur.
  const optionsText = (defs: FieldDef[]) => Object.fromEntries(defs.filter((f) => f.type === "choice").map((f) => [f.key, (f.options ?? []).join(", ")]));
  const [options, setOptions] = useState<Record<string, string>>(() => optionsText(c.fieldDefs));
  // The per-unit switch as tapped, until the save comes back (DEC-062), so it doesn't snap back meanwhile.
  const [perUnitTapped, setPerUnitTapped] = useState<Record<string, boolean>>({});
  const [newField, setNewField] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // A new field whose name other categories already use (DEC-071): the same field, or a separate one?
  const [asking, setAsking] = useState<string | null>(null);
  // A universal field renamed from another category's card shows its new name here too.
  const namesNow = c.fieldDefs.map((f) => `${f.key}=${f.label}`).join("|");
  useEffect(() => {
    setLabels(Object.fromEntries(c.fieldDefs.map((f) => [f.key, f.label])));
  }, [namesNow]);
  // The other categories' fields, by key: what a field here is shared with, or could be.
  const others = all.filter((x) => x.id !== c.id);
  const usedIn = (key: string) => others.filter((x) => x.fieldDefs.some((d) => d.key === key)).map((x) => x.name);
  const sameNamed = (label: string) => {
    const mine = new Set(c.fieldDefs.map((f) => f.key));
    const found = new Map<string, { key: string; label: string; in: string[] }>();
    for (const x of others)
      for (const d of x.fieldDefs)
        if (bare(d.label) === bare(label) && !mine.has(d.key)) found.set(d.key, { key: d.key, label: d.label, in: [...(found.get(d.key)?.in ?? []), x.name] });
    return [...found.values()];
  };
  const merge = useMutation({
    mutationFn: (v: { key: string; withKey: string }) => api<Category[]>("/fields/merge", { method: "POST", body: v }),
    onSuccess: (cats) => {
      qc.setQueryData<Category[]>(["categories"], cats);
      for (const key of ["item", "items", "categories"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  const patch = useMutation({
    mutationFn: (body: UpdateCategory) => api<Category>(`/categories/${c.id}`, { method: "PATCH", body }),
    onSuccess: (updated) => {
      qc.setQueryData<Category[]>(["categories"], (old) => old?.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setLabels(Object.fromEntries(updated.fieldDefs.map((f) => [f.key, f.label])));
      setOptions(optionsText(updated.fieldDefs));
      setPerUnitTapped({});
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

  const fields = c.fieldDefs.map((f) => ({ key: f.key, label: labels[f.key] ?? f.label, type: f.type === "choice" ? ("choice" as const) : ("text" as const), options: f.options, perUnit: f.perUnit }));
  type FieldIn = { key?: string; label: string; type?: "text" | "choice"; options?: string[]; perUnit?: boolean; shareKey?: string };
  const saveFields = (next: FieldIn[]) => patch.mutate({ fieldDefs: next });
  const parseOptions = (text: string) => text.split(/[,\n]/).map((o) => o.trim()).filter(Boolean);
  const setPerUnit = (key: string, perUnit: boolean) => {
    setPerUnitTapped((t) => ({ ...t, [key]: perUnit }));
    saveFields(fields.map((x) => (x.key === key ? { ...x, perUnit } : x)));
  };
  const setType = (key: string, type: "text" | "choice") => saveFields(fields.map((x) => (x.key === key ? { ...x, type, options: type === "choice" ? x.options ?? [] : undefined } : x)));
  const saveOptions = (key: string) => {
    const next = parseOptions(options[key] ?? "");
    const f = fields.find((x) => x.key === key);
    if (f && next.join("\u0000") !== (f.options ?? []).join("\u0000")) saveFields(fields.map((x) => (x.key === key ? { ...x, options: next } : x)));
  };
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
    const label = fieldName(newField);
    if (!label) return;
    // Another category already has a field of this name: ask whether it's the same field (DEC-071).
    if (sameNamed(label).length > 0) return setAsking(label);
    setNewField("");
    saveFields([...fields, { label }]);
  };
  const addAs = (label: string, shareKey?: string) => {
    setAsking(null);
    setNewField("");
    saveFields([...fields, { label, ...(shareKey ? { shareKey } : {}) }]);
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
        {/* Each field in its own outline, so its name, options and switches read as one (Colin, 2026-11-13). */}
        <ul className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <li key={f.key} className="flex flex-col gap-1.5 rounded-xl border border-border/70 p-2" data-field={f.label}>
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
              {/* A choice field's options sit right under its name, so it's plain which field they belong to. */}
              {f.type === "choice" && (
                <input
                  value={options[f.key] ?? ""}
                  onChange={(e) => setOptions((o) => ({ ...o, [f.key]: e.target.value }))}
                  onBlur={() => saveOptions(f.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className={`${inputClass} min-h-9 text-sm`}
                  placeholder={`Options for ${f.label}, separated by commas: Li-ion, LiPo, NiMH`}
                  aria-label={`Options for ${f.label}`}
                />
              )}
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <div className="flex overflow-hidden rounded-lg border border-border text-[13px]" role="radiogroup" aria-label={`Kind of ${f.label}`}>
                  {fieldTypes.map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={f.type === t} onClick={() => f.type !== t && setType(f.key, t)} className={`min-h-8 px-2.5 ${f.type === t ? "bg-accent/15 text-accent" : "text-muted"}`}>
                      {fieldTypeLabels[t]}
                    </button>
                  ))}
                </div>
                {/* Each stickered unit holds its own value (DEC-062): a battery's charge level, a tool's calibration date. */}
                <label className="flex min-h-8 items-center gap-1.5 text-[13px] text-muted">
                  <input type="checkbox" checked={perUnitTapped[f.key] ?? !!f.perUnit} onChange={(e) => setPerUnit(f.key, e.target.checked)} className="h-4 w-4" aria-label={`Each stickered one has its own ${f.label}`} />
                  Each stickered one has its own
                </label>
              </div>
              {/* What kind of field it is (DEC-071), and the offer to make two same-named fields one. */}
              {(() => {
                const def = c.fieldDefs.find((d) => d.key === f.key);
                const shared = usedIn(f.key);
                const twins = def?.universal ? [] : sameNamed(f.label);
                return (
                  <div className="flex flex-col gap-1 pl-1 text-[13px] text-muted" data-field-kind={def?.universal ? "universal" : "category-only"}>
                    <span>
                      {def?.universal ? (
                        <>
                          <span className="font-medium text-info">Universal field</span>
                          {shared.length > 0 ? ` · also in ${shared.join(", ")}` : ""}. Its value follows a part into any category.
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-text">Category-only field</span>. Its value stays with {c.name}.
                        </>
                      )}
                    </span>
                    {twins.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1.5" data-same-name>
                        <span>
                          {twins.length === 1 ? `${twins[0]!.in.join(", ")} has` : `${twins.length} other categories have`} a separate field named {f.label}. Same field? Make it universal with:
                        </span>
                        {twins.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            disabled={merge.isPending}
                            onClick={() => {
                              if (window.confirm(`Make ${f.label} one universal field shared by ${c.name} and ${t.in.join(", ")}? Parts keep their values, and the value will follow a part between these categories. This can't be undone.`)) merge.mutate({ key: f.key, withKey: t.key });
                            }}
                            className="rounded-lg border border-accent/50 px-2 py-0.5 font-medium text-accent"
                            aria-label={`Make ${f.label} of ${c.name} the same field as in ${t.in.join(", ")}`}
                          >
                            {t.in.join(", ")}
                          </button>
                        ))}
                        {twins.length > 1 && (
                          <button
                            type="button"
                            disabled={merge.isPending}
                            onClick={async () => {
                              if (!window.confirm(`Make ${f.label} one universal field shared by ${c.name} and all ${twins.length} of these categories? Parts keep their values. This can't be undone.`)) return;
                              for (const t of twins) await merge.mutateAsync({ key: f.key, withKey: t.key });
                            }}
                            className="rounded-lg border border-accent bg-accent/10 px-2 py-0.5 font-semibold text-accent"
                            aria-label={`Make ${f.label} of ${c.name} the same field in all ${twins.length} other categories`}
                          >
                            All {twins.length}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })()}
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
        {asking && (
          <div className="flex flex-col gap-2 rounded-xl border border-accent/50 bg-accent/5 p-3 text-sm" role="group" aria-label={`${asking} already exists`}>
            <p>
              <span className="font-semibold">{asking}</span> is already a field in another category. Is this the same field?
            </p>
            {sameNamed(asking).map((t) => (
              <Button key={t.key} type="button" onClick={() => addAs(t.label, t.key)} className="justify-start text-left">
                Use the {t.label} of {t.in.join(", ")} (universal: its value follows a part between them)
              </Button>
            ))}
            <Button type="button" onClick={() => addAs(asking)} className="justify-start text-left">
              Make a separate {asking}, only for {c.name}
            </Button>
            <Button type="button" variant="ghost" className="self-start" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        )}
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
