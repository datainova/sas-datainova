import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: string; type: "success" | "error" | "info"; title: string; description?: string };

interface ToastContextValue {
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((arr) => [...arr, { id, ...t }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  const value = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-md border px-3 py-2 text-sm shadow-lg ${
            t.type === "success" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" :
            t.type === "error" ? "border-red-400/40 bg-red-500/10 text-red-100" :
            "border-white/15 bg-white/10 text-white/80"
          }`}>
            <div className="font-semibold">{t.title}</div>
            {t.description ? <div className="text-xs opacity-80">{t.description}</div> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider ausente");
  return ctx;
}

