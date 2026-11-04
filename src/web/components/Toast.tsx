import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Toast = { id: number; message: string; undoEventId?: number | null; tone?: "ok" | "error"; top?: boolean };
type ToastApi = { show: (t: Omit<Toast, "id" | "top">) => void };

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_MS = 6000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}

/**
 * One toast at a time, above the bottom bar. Stock changes come with Undo. While a
 * sheet is up from the bottom (it carries `data-sheet`), the toast shows at the top
 * instead, so it doesn't cover what you're tapping.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(1);
  const show = useCallback(
    (t: Omit<Toast, "id" | "top">) => setToast({ ...t, id: nextId.current++, top: document.querySelector("[data-sheet]") !== null }),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const undo = (eventId: number) => {
    setToast(null);
    api(`/events/${eventId}/undo`, { method: "POST" })
      .then(() => {
        qc.invalidateQueries();
        show({ message: "Undone" });
      })
      .catch((e: Error) => show({ message: e.message, tone: "error" }));
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 lg:left-56 ${
            toast.top ? "top-0 pt-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-24 pb-[env(safe-area-inset-bottom)] lg:bottom-6"
          }`}
        >
          <div
            role="status"
            className={`toast-in pointer-events-auto flex min-h-12 max-w-md flex-1 items-center gap-3 rounded-xl border px-4 shadow-lg ${
              toast.tone === "error" ? "border-danger/40 bg-[#2a1717] text-danger" : "border-border bg-surface-2"
            }`}
          >
            <span className="flex-1 py-2 text-sm">{toast.message}</span>
            {toast.undoEventId ? (
              <button onClick={() => undo(toast.undoEventId!)} className="min-h-11 px-2 font-semibold text-accent">
                Undo
              </button>
            ) : null}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
