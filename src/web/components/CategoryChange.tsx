import { useEffect } from "react";
import type { Category } from "../../shared/api";
import { leavingValues, type Leaving } from "../../shared/fields";
import { Button } from "./ui";

// Changing a part's category (DEC-072). A field belongs to one category, so the values a part
// holds in its old category's fields can't come along as they are: this dialog lists them and
// asks, with buttons that say the result. Kept, a value goes into the new category's field of
// the same name when it fits, else it becomes a custom field of the part. A part holding no such
// values changes category with no dialog.

export type CategoryValuesChoice = "keep" | "delete";

/** What a part would leave behind going from one category to another; empty means no dialog. */
export function leavingFor(
  from: Category | undefined,
  to: Category | null | undefined,
  attributes: Record<string, string>,
  units: { id: number; code: string | null; attributes?: Record<string, string> | null }[],
): Leaving[] {
  if (!from || from.id === to?.id) return [];
  return leavingValues(from.fieldDefs, to?.fieldDefs ?? [], attributes, units);
}

export function CategoryChangeDialog({
  partName,
  from,
  to,
  leaving,
  onChoose,
  onCancel,
}: {
  partName: string;
  from: Category;
  to: Category | null;
  leaving: Leaving[];
  onChoose: (choice: CategoryValuesChoice) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    // Escape cancels this dialog only, not a popup it sits on.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onCancel]);
  const n = leaving.length;
  const these = n === 1 ? "this value" : `these ${n} values`;
  const verb = to ? "Change category" : "Remove the category";
  const title = to ? `Change category to ${to.name}?` : `Take it out of ${from.name}?`;
  const allCustom = leaving.every((l) => !l.into);
  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center lg:justify-center lg:p-[5vh]">
      <div className="absolute inset-0 bg-black/55" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-category-change
        className="relative flex max-h-[92vh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:max-h-full lg:w-[30rem] lg:rounded-2xl lg:border lg:p-6"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-text">{partName}</span> has {n === 1 ? "a value" : `${n} values`} in the fields of {from.name}.{" "}
          {to ? `Fields belong to one category, so ${n === 1 ? "it doesn't" : "they don't"} stay as ${n === 1 ? "it is" : "they are"}.` : "With no category it has no category fields."}
        </p>
        <ul className="overflow-hidden rounded-xl border border-border">
          {leaving.map((l) => (
            <li key={`${l.key}-${l.unitId ?? ""}`} className="flex items-start justify-between gap-3 border-t border-border px-3 py-2 text-sm first:border-t-0" data-leaving={l.label}>
              <span className="text-muted">
                {l.label}
                {l.unitCode ? ` · ${l.unitCode}` : ""}
              </span>
              <span className="flex flex-col items-end text-right">
                <span className="font-semibold">{l.value}</span>
                <span className="text-[12px] text-accent">{l.into ? `if kept: goes into ${l.label} in ${to!.name}` : "if kept: becomes a custom field"}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="primary" onClick={() => onChoose("keep")}>
          {verb}, keep {these}
          {allCustom ? ` as ${n === 1 ? "a custom field" : "custom fields"}` : ""}
        </Button>
        <Button type="button" variant="danger" onClick={() => onChoose("delete")}>
          {verb}, delete {these}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel, stay in {from.name}
        </Button>
      </div>
    </div>
  );
}
