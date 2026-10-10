"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
}

/** "success" is the default (a green tick, 3.5 s). "warning" is for something that did not work: a warning icon, and it stays about 8 s. */
export type ToastTone = "success" | "warning";

interface ToastContextValue {
  showToast: (message: string, description?: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const showToast = React.useCallback((message: string, description?: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, description, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, tone === "warning" ? 8000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition-all dark:border-gray-800 dark:bg-gray-900"
              >
                {t.tone === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-500" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{t.message}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
