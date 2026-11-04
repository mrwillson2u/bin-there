import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff } from "lucide-react";
import type { Pins } from "../../shared/api";
import { api } from "../api";
import { useToast } from "./Toast";

/** Pin a part to the top of Inventory, or a place to the top of Locations (F11, DEC-026). */
export function PinButton({ kind, id, pinned }: { kind: "item" | "location"; id: number; pinned: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: () => api<Pins>(`/pins/${kind}/${id}`, { method: pinned ? "DELETE" : "PUT" }),
    onSuccess: (pins) => {
      qc.setQueryData(["pins"], pins);
      qc.invalidateQueries({ queryKey: [kind, id] });
      if (kind === "item") qc.invalidateQueries({ queryKey: ["items"] });
      toast.show({ message: pinned ? "Unpinned" : `Pinned to the top of ${kind === "item" ? "Inventory" : "Locations"}` });
    },
    onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
  });
  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin" : "Pin"}
      className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 ${pinned ? "text-warn" : "text-muted"}`}
    >
      {pinned ? <PinOff size={18} /> : <Pin size={18} />}
      {pinned ? "Unpin" : "Pin"}
    </button>
  );
}
