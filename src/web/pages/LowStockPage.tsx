import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { levelLabels, type ItemSummary } from "../../shared/api";
import { api } from "../api";
import { ItemList } from "../components/ItemList";
import { Button, itemName } from "../components/ui";

// The shopping list: level items that are low or out, and exact items at zero or at/below
// their low-stock warning (set on the item's edit screen). "Copy" puts it on the clipboard
// as plain text for a supplier site or a note.

export function LowStockPage() {
  const { data } = useQuery({ queryKey: ["low"], queryFn: () => api<ItemSummary[]>("/items/low") });
  const [copied, setCopied] = useState(false);
  if (!data) return <p className="text-muted">Loading…</p>;

  const line = (i: ItemSummary) => {
    const status =
      i.tracking === "level"
        ? levelLabels[(["out", "low"] as const).find((l) => i.places.some((p) => p.level === l)) ?? "low"]
        : `${i.totalQty ?? 0} left${i.lowThreshold !== null ? ` (warn at ${i.lowThreshold})` : ""}`;
    return `- ${itemName(i.name)}: ${status}`;
  };
  const copy = () =>
    navigator.clipboard.writeText(data.map(line).join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold">Running low</h1>
          <p className="text-[13px] text-muted">
            Things marked low or out, and counted items at or below their low-stock warning. Set the warning on an item's edit screen.
          </p>
        </div>
        {data.length > 0 && (
          <Button onClick={copy} aria-label="Copy the list as text">
            <Copy size={18} /> {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <ItemList items={data} empty="Nothing is running low." />
    </div>
  );
}
