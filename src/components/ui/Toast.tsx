"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Minimal toast surface — used for non-blocking failures of background writes
 * (e.g. a set log that couldn't reach the server). The app is online-only
 * (no offline outbox, per CLAUDE.md), so a failed write rolls the control back
 * and surfaces a quiet, square-cornered ledger note here rather than blocking.
 */

type Toast = { id: number; message: string };

const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const show = useCallback((message: string) => {
    const id = (nextId.current += 1);
    setToasts((t) => [...t, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 4000);
    timers.current.set(id, timer);
  }, []);

  // Clear any pending auto-dismiss timers if the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="label-caps pointer-events-auto max-w-sm border-2 border-ink bg-paper px-4 py-2 text-center text-[10px] font-semibold text-ink"
            style={{ boxShadow: "var(--shadow-menu)" }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
