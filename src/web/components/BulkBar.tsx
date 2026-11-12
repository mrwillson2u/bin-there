import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderInput, Hash, ListChecks, Tags, Trash2, X } from "lucide-react";
import { trackingLabels, trackingModes, type BulkAction, type BulkResult, type Category, type ItemSummary } from "../../shared/api";
import { api } from "../api";
import { CategoryPicker, useCreateCategory } from "./CategoryPicker";
import { PickLocation } from "./PickLocation";
import { useToast } from "./Toast";
import { Button, itemName } from "./ui";

// Bulk editing (DEC-057): Select on Inventory and Search turns the rows into checkboxes; this
// bar sits at the bottom with what can be done to the checked parts: set their category, move
// everything they have to one place, set how they're counted, or delete them. Each part gets its
// own activity entry, so Undo is per part, from the part's page or Activity.

export type Selection = { has: (id: number) => boolean; toggle: (id: number) => void };

/** The checked parts, and whether checking is on. Leaving the screen drops it. */
export function useSelection() {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) =>
    setIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stop = () => {
    setOn(false);
    setIds(new Set());
  };
  return {
    on,
    ids,
    start: () => setOn(true),
    stop,
    setAll: (all: number[]) => setIds(new Set(all)),
    selection: on ? ({ has: (id: number) => ids.has(id), toggle } satisfies Selection) : undefined,
  };
}

/** The Select / Done button that turns checking on and off. */
export function SelectButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "Done" : "Select"}
      title={on ? "Done selecting" : "Select parts to edit together"}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm sm:px-3 ${on ? "border-accent bg-accent/15 text-accent" : "border-border text-text"}`}
    >
      <ListChecks size={16} /> <span className="hidden sm:inline">{on ? "Done" : "Select"}</span>
    </button>
  );
}

/** The box at the start of a row or on a tile's corner that shows whether it's checked. */
export function CheckBox({ checked, onPhoto }: { checked: boolean; onPhoto?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
        checked ? "border-accent bg-accent text-accent-fg" : onPhoto ? "border-white/85 bg-black/35" : "border-muted/60 bg-surface"
      }`}
    >
      {checked && <Check size={16} strokeWidth={3} />}
    </span>
  );
}

type Panel = "category" | "move" | "tracking" | "delete";

export function BulkBar({ ids, shown, onSelectAll, onClose }: { ids: Set<number>; shown: ItemSummary[]; onSelectAll: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const createCategory = useCreateCategory();
  const n = ids.size;
  const parts = n === 1 ? "1 part" : `${n} parts`;

  const run = async (action: BulkAction, said: string) => {
    setBusy(true);
    try {
      const r = await api<BulkResult>("/items/bulk", { method: "POST", body: { ids: [...ids], action } });
      qc.invalidateQueries();
      if (r.failed.length === 0) toast.show({ message: said.replace("%", r.done === 1 ? "1 part" : `${r.done} parts`) });
      else {
        const why = r.failed
          .slice(0, 3)
          .map((f) => `${itemName(f.name ?? "")}: ${f.message}`)
          .join("; ");
        toast.show({ message: `${said.replace("%", r.done === 1 ? "1 part" : `${r.done} parts`)}; ${r.failed.length} couldn't (${why})`, tone: "error" });
      }
      onClose();
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const action = (p: Panel, icon: React.ReactNode, label: string, danger?: boolean) => (
    <button
      type="button"
      onClick={() => setPanel(panel === p ? null : p)}
      disabled={n === 0 || busy}
      aria-pressed={panel === p}
      className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs disabled:opacity-40 lg:min-h-11 lg:flex-row lg:gap-2 lg:px-3 lg:text-sm ${
        panel === p ? "bg-accent/15 text-accent" : danger ? "text-danger" : "text-text"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.25)] lg:left-56" data-sheet data-bulk-bar role="region" aria-label="Selected parts">
      <div className="mx-auto flex max-w-2xl flex-col lg:max-w-6xl lg:px-8">
        {panel && (
          <div className="max-h-[60vh] overflow-y-auto border-b border-border px-4 py-3">
            {panel === "category" && cats && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Give {parts} this category:</p>
                <CategoryPicker categories={cats} value={categoryId} onChange={(c) => setCategoryId(c?.id ?? null)} onCreate={createCategory} allowNone label="Category for the selected parts" />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => run({ type: "category", categoryId }, categoryId ? `Set % to ${cats.find((c) => c.id === categoryId)?.name ?? "that category"}` : "Cleared the category of %")}>
                    {categoryId ? "Set category" : "Clear category"}
                  </Button>
                  <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {panel === "move" && (
              <PickLocation title={`Scan where the ${parts} go`} onPick={(loc) => run({ type: "move", locationId: loc.id }, `Moved % to ${loc.name}`)} onCancel={() => setPanel(null)}>
                <p className="text-sm text-muted">Everything each part has goes there: every count in one place, units at home, and checked-out units come back there.</p>
              </PickLocation>
            )}
            {panel === "tracking" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Count {parts} by:</p>
                <div className="flex flex-wrap gap-2">
                  {trackingModes.map((t) => (
                    <Button key={t} disabled={busy} onClick={() => run({ type: "tracking", tracking: t }, `% now counted by ${trackingLabels[t].toLowerCase()}`)}>
                      {trackingLabels[t]}
                    </Button>
                  ))}
                  <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                </div>
                <p className="text-[13px] text-muted">A count becomes Plenty (or Out at 0); a level becomes "not counted" (Out becomes 0).</p>
              </div>
            )}
            {panel === "delete" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm">Delete {parts}? Their history is kept, and each one can be undone from Activity.</p>
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy} onClick={() => run({ type: "delete" }, "Deleted %")}>
                    <Trash2 size={18} /> Delete {parts}
                  </Button>
                  <Button variant="ghost" onClick={() => setPanel(null)}>Keep them</Button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-2 lg:px-2 lg:py-2">
          {/* Phone: the count and the X on one line, the actions spread on the next; wide: all on one line. */}
          <div className="flex items-center gap-3 pl-4 pr-2 lg:px-2">
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums" aria-live="polite">{n === 0 ? "None selected" : `${n} selected`}</span>
            {shown.some((i) => !ids.has(i.id)) && (
              <button type="button" onClick={onSelectAll} className="min-h-9 whitespace-nowrap text-[13px] text-accent">
                All {shown.length} shown
              </button>
            )}
            <span className="flex-1 lg:hidden" />
            <button type="button" onClick={onClose} aria-label="Stop selecting" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted lg:hidden">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center justify-around px-2 pb-1 lg:flex-1 lg:justify-start lg:pb-0" role="group" aria-label="Do with the selected parts">
            {action("category", <Tags size={20} />, "Category")}
            {action("move", <FolderInput size={20} />, "Move")}
            {action("tracking", <Hash size={20} />, "Counting")}
            {action("delete", <Trash2 size={20} />, "Delete", true)}
          </div>
          <button type="button" onClick={onClose} aria-label="Stop selecting" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted lg:flex">
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
