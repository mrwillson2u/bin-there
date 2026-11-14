import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Search, Sparkles, Tags, Trash2, X } from "lucide-react";
import { fieldTypeLabels, fieldTypes, itemKindLabels, itemKinds, trackingLabels, trackingModes, type Category, type CategoryUsage, type FieldDef, type UpdateCategory } from "../../shared/api";
import { fieldName } from "../../shared/fields";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { useAiStatus } from "../components/AiSuggestions";
import { TidyNamesDialog } from "../components/TidyNames";
import { Button, inputClass } from "../components/ui";

// Categories (DEC-056): the list, and for each one its name, its usual kind and way of counting,
// and its fields to add, rename, reorder and remove. Changes save as you go. A field keeps its
// hidden key when renamed, so every part's value stays attached; a removed field's values stay
// stored on the parts, unseen, and come back if the field is added again under the same name.
// A category parts still use can't be deleted (bulk editing moves them). A field is Text or
// Choice (DEC-059): a choice field lists its options, which the part's form offers in a drop-down
// and the AI picks from. A field belongs to its one category (DEC-072): two categories can each
// have a Voltage, and they are separate fields.

export function CategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const { data: usage } = useQuery({ queryKey: ["categories", "usage"], queryFn: () => api<Record<number, CategoryUsage>>("/categories/usage") });
  const [newName, setNewName] = useState("");
  const [fresh, setFresh] = useState<number | null>(null);
  const add = useMutation({
    mutationFn: (name: string) => api<Category>("/categories", { method: "POST", body: { name } }),
    onSuccess: (made) => {
      setNewName("");
      // The new category's card comes into view with its name ready to edit (issue #4).
      setFresh(made.id);
      qc.setQueryData<Category[]>(["categories"], (old) => (old && !old.some((x) => x.id === made.id) ? [...old, made].sort((a, b) => a.name.localeCompare(b.name)) : old));
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });

  if (!categories || !usage) return <p className="text-muted">Loading…</p>;
  // The box at the top finds a category as you type, and adds one when the name is new (issue #4, DEC-079).
  const typed = newName.trim();
  const shown = typed ? categories.filter((c) => c.name.toLowerCase().includes(typed.toLowerCase())) : categories;
  const exists = categories.some((c) => c.name.toLowerCase() === typed.toLowerCase());
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
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed && !exists) add.mutate(typed);
        }}
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNewName("");
              }}
              className={`${inputClass} w-full pl-10 ${typed ? "pr-10" : ""}`}
              placeholder="Find a category, or type a new name to add it"
              aria-label="Find or add a category"
            />
            {typed && (
              <button type="button" onClick={() => setNewName("")} aria-label="Clear" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted">
                <X size={16} />
              </button>
            )}
          </div>
          <Button type="submit" variant={typed && !exists ? "primary" : "secondary"} disabled={!typed || exists || add.isPending} aria-label={typed && !exists ? `Add ${typed} as a new category` : "Add a new category"}>
            <Plus size={18} /> Add
          </Button>
        </div>
        {typed && (
          <p className="px-1 text-[13px] text-muted" role="status" data-category-find>
            {exists ? (
              shown.length === 1 ? "Showing that category." : `Showing ${shown.length} categories with “${typed}” in the name.`
            ) : (
              <>
                {shown.length === 0 ? `No category has “${typed}” in its name.` : `Showing ${shown.length === 1 ? "1 category" : `${shown.length} categories`} with “${typed}” in the name.`}{" "}
                <span className="text-text">Press Add to create a new category named “{typed}”.</span>
              </>
            )}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
        {shown.map((c) => (
          <CategoryCard key={c.id} category={c} usage={usage[c.id] ?? { items: 0, fields: {} }} fresh={c.id === fresh} />
        ))}
      </div>
      <p className="text-[13px] text-muted">
        Parts are given a category on their form or on <Link to="/needs-details" className="text-accent">Fill in details</Link>.
      </p>
    </div>
  );
}

function CategoryCard({ category: c, usage, fresh = false }: { category: Category; usage: CategoryUsage; fresh?: boolean }) {
  // Just added from the box at the top: scrolled into view, outlined, its name selected for a quick fix.
  const cardRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!fresh) return;
    cardRef.current?.scrollIntoView({ block: "center" });
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [fresh]);
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
  // Tidy names (DEC-076): the AI suggests new names for this category's parts; each is approved in the dialog.
  const ai = useAiStatus();
  const [tidying, setTidying] = useState(false);
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
  type FieldIn = { key?: string; label: string; type?: "text" | "choice"; options?: string[]; perUnit?: boolean };
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
    setNewField("");
    saveFields([...fields, { label }]);
  };

  return (
    <section
      ref={cardRef}
      className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 ${fresh ? "border-accent ring-2 ring-accent/40" : "border-border"}`}
      data-category={c.name}
      data-fresh={fresh || undefined}
      aria-label={`Category ${c.name}`}
    >
      {fresh && <p className="text-[13px] font-medium text-accent">New category. Rename it here, set how it's counted, and add its fields.</p>}
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
          ref={nameRef}
          className={`${inputClass} min-w-0 flex-1 font-semibold`}
          aria-label={`Name of ${c.name}`}
        />
        <span className="shrink-0 text-[13px] text-muted">{usage.items === 1 ? "1 part" : `${usage.items} parts`}</span>
      </div>
      {ai?.enabled && usage.items > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="min-h-9 text-sm" onClick={() => setTidying(true)} aria-label={`Tidy the names in ${c.name}`}>
            <Sparkles size={16} /> Tidy names…
          </Button>
          <span className="text-[13px] text-muted">The AI suggests names that read alike. You approve each.</span>
        </div>
      )}
      {tidying && <TidyNamesDialog category={c} onClose={() => setTidying(false)} />}

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
