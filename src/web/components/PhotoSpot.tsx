import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import type { ItemDetail } from "../../shared/api";
import { api, uploadPhoto } from "../api";
import { readBagCode } from "../lib/bagcode";
import { bagPartNumber, bagText } from "../../shared/bagcode";
import { preparePhoto } from "../lib/photo";
import { useToast } from "./Toast";

/** Resize a photo on the device (DEC-006) and attach it to an item; screens showing the item refresh. A shop bag's barcode in it is read too (DEC-074). */
export function useAddPhoto(itemId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const [{ photo, thumb }, bag] = await Promise.all([preparePhoto(file), readBagCode(file)]);
      let updated = await uploadPhoto<ItemDetail>(itemId, photo, thumb);
      // A shop bag's barcode in the photo (DEC-074) fills the part number when the part has none.
      const pn = bag ? bagPartNumber(bag) : null;
      if (bag && pn) {
        if (!updated.supplierPn) {
          updated = await api<ItemDetail>(`/items/${itemId}`, { method: "PATCH", body: { supplierPn: pn, ...(bag.supplier && !updated.supplier ? { supplier: bag.supplier } : {}) } });
          toast.show({ message: `Bag barcode read: ${bagText(bag)} saved as its part number` });
        } else if (updated.supplierPn !== pn) {
          toast.show({ message: `Bag barcode read: ${bagText(bag)}. This part already has ${updated.supplierPn}, left as it is` });
        }
      }
      qc.setQueryData(["item", itemId], updated);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["pins"] });
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { add, busy };
}

/**
 * A part's photo, which opens the part. With no photo yet the same spot is a button
 * that takes one, since a part being put in a bin is usually in your hand (DEC-024).
 */
export function PhotoSpot({ itemId, url, size, label }: { itemId: number; url: string | null; size: number; label: string }) {
  const { add, busy } = useAddPhoto(itemId);
  const big = size >= 80;
  if (url) {
    return (
      <Link to={`/items/${itemId}`} aria-label={`Open ${label}`} className="shrink-0">
        <img src={url} alt="" className="rounded-xl bg-surface-2 object-cover" style={{ width: size, height: size }} />
      </Link>
    );
  }
  return (
    <label
      className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface-2 text-accent active:bg-surface ${busy ? "opacity-50" : ""}`}
      style={{ width: size, height: size }}
    >
      <Camera size={big ? 28 : 20} />
      {big && <span className="text-[13px] font-semibold">{busy ? "Saving…" : "Add photo"}</span>}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={busy}
        aria-label={`Take a photo of ${label}`}
        onChange={(e) => {
          void add(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
