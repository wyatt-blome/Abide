"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { haptic, type HapticPattern } from "./haptics";
import { Icon } from "./Icon";

export type ToastTone = "info" | "success" | "error";

export interface ToastOptions {
  tone?: ToastTone;
  /** ms before auto-dismiss. Default 3500. */
  duration?: number;
  /** Vibrate as the toast appears. */
  haptic?: HapticPattern;
  /** Optional single action, e.g. { label: "Undo", onAction }. */
  action?: { label: string; onAction: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

export type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Returns `toast(message, options)`. Outside a ToastProvider it is a no-op. */
export function useToast(): ShowToast {
  return useContext(ToastContext) ?? noop;
}

function noop() {}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, ...options }]);
      if (options.haptic !== undefined) haptic(options.haptic);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.duration ?? 3500),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className={cx(
          "pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4",
          "bottom-[calc(var(--tabbar-height)+var(--actionbar-height)+var(--safe-bottom)+8px)]",
        )}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "toast bordered pointer-events-auto flex min-h-12 w-full max-w-[40rem] items-center gap-3 rounded-xl px-4 py-2 shadow-lg",
              t.tone === "error" ? "bg-danger text-danger-fg" : t.tone === "success" ? "bg-success text-success-fg" : "bg-fg text-bg",
            )}
          >
            {t.tone === "success" ? <Icon name="check" size={22} /> : t.tone === "error" ? <Icon name="cross" size={22} /> : null}
            <span className="flex-1 font-semibold">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="tap rounded-lg px-3 font-bold underline"
                onClick={() => {
                  t.action?.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
