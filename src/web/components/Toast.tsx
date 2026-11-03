import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Toast = { id: number; message: string; undoEventId?: number | null; tone?: "ok" | "error" };
type ToastApi = { show: (t: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_MS = 6000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}

/** One toast at a time, above the bottom bar. Stock changes come with Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(1);
  const show = useCallback((t: Omit<Toast, "id">) => setToast({ ...t, id: nextId.current++ }), []);

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
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 pb-[env(safe-area-inset-bottom)] lg:bottom-6 lg:left-56">
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
