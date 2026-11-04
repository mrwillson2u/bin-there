import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { levelLabels, type ItemSummary, type LocationItem, type StockLevel } from "../../shared/api";
import { Badge, itemName, PlacePath, Thumb } from "./ui";
import { outText } from "./TakeOut";

const levelTone: Record<StockLevel, "ok" | "warn" | "danger"> = { plenty: "ok", low: "warn", out: "danger" };

/** "40", "Low", "2 units", "not counted". The same wording everywhere. */
export function QtyBadge({ qty, level, units, tracking }: { qty: number | null; level: StockLevel | null; units: number; tracking: string }) {
  if (tracking === "level" && level) return <Badge tone={levelTone[level]}>{levelLabels[level]}</Badge>;
  if (qty !== null) return <span className="font-mono text-lg font-semibold tabular-nums">{qty + units}</span>;
  if (units > 0) return <span className="font-mono text-lg font-semibold tabular-nums">{units}</span>;
  return <Badge tone="warn">not counted</Badge>;
}

/** An item's total across its places: a count, its lowest level, or "not counted". */
export function ItemTotal({ item: i, small }: { item: ItemSummary; small?: boolean }) {
  const num = small ? "font-mono text-sm font-semibold tabular-nums text-text" : "font-mono text-lg font-semibold tabular-nums";
  if (i.totalQty !== null) return <span className={num}>{i.totalQty}</span>;
  if (i.tracking === "level") {
    const levels = i.places.map((p) => p.level).filter((l): l is StockLevel => l !== null);
    // With several places, show the lowest level.
    const worst = (["out", "low", "plenty"] as const).find((l) => levels.includes(l));
    return worst ? <Badge tone={levelTone[worst]}>{levelLabels[worst]}</Badge> : null;
  }
  return i.places.length > 0 ? <Badge tone="warn">not counted</Badge> : null;
}

export function ItemList({ items, empty }: { items: ItemSummary[]; empty: string }) {
  if (items.length === 0) return <p className="px-1 py-6 text-center text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`/items/${i.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-surface-2">
            <Thumb url={i.thumbUrl} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`truncate ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
                {i.needsDetails && <Badge tone="warn">needs details</Badge>}
                {i.checkedOut > 0 && <Badge tone="info">{i.checkedOut} out</Badge>}
              </span>
              {i.places.length === 0 ? (
                <span className="block text-[13px] text-muted">No location</span>
              ) : (
                i.places.slice(0, 3).map((p) => (
                  <PlacePath
                    key={p.locationId}
                    path={p.path}
                    className="text-[13px] text-muted"
                    after={
                      <>
                        {i.places.length > 1 &&
                          (p.qty !== null || p.units > 0 ? ` · ${(p.qty ?? 0) + p.units}` : "") + (i.tracking === "level" && p.level ? ` · ${levelLabels[p.level]}` : "")}
                        {p.out && <span className="text-info"> · {outText(p.out)}</span>}
                      </>
                    }
                  />
                ))
              )}
              {i.places.length > 3 && <span className="block text-[13px] text-muted">+{i.places.length - 3} more places</span>}
            </span>
            <ItemTotal item={i} />
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function LocationItemList({ items }: { items: LocationItem[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((i) => (
        <li key={i.itemId}>
          <Link to={`/items/${i.itemId}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-surface-2">
            <Thumb url={i.thumbUrl} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${i.name ? "" : "italic text-muted"}`}>{itemName(i.name)}</span>
              <span className="flex gap-1.5">
                {i.needsDetails && <Badge tone="warn">needs details</Badge>}
                {i.stale && <Badge tone="warn">recount?</Badge>}
              </span>
            </span>
            <QtyBadge qty={i.qty} level={i.level} units={i.units} tracking={i.tracking} />
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
