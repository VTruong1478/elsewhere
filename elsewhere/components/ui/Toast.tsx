"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type ToastTone = "error" | "success";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  /** Show a transient message. Defaults to the error tone. */
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

/**
 * App-wide toast host.
 *
 * Optimistic mutations across the app roll back correctly but used to do so
 * silently — the save icon just flipped back with no explanation. This gives
 * them somewhere to report failures, and announces them to screen readers.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "error") => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const id = nextId.current++;
      setToasts((current) => [...current, { id, message: trimmed, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  // The portal must not render during hydration: `typeof document` is false on
  // the server and true on the client's first render, which makes the server
  // and client trees differ and fails hydration on every page. Gating on a
  // state flag keeps both first renders identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            // Above Modal (z-[60]) so errors raised inside a modal stay visible.
            className="pointer-events-none fixed inset-x-0 bottom-0 z-70 flex flex-col items-center gap-8 p-16"
            role="status"
            aria-live="polite"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`pointer-events-auto flex w-full max-w-md items-start gap-12 rounded-radius-md bg-surface px-16 py-12 shadow-map animate-toast-in ${
                  toast.tone === "success"
                    ? "border-l-4 border-status-high"
                    : "border-l-4 border-status-low"
                }`}
              >
                <p className="min-w-0 flex-1 text-body-m text-text">
                  {toast.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 text-text-secondary"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/** Stable identity so callers can safely use `showToast` in dependency arrays. */
const NOOP_TOAST: ToastContextValue = { showToast: () => {} };

/**
 * Returns `showToast`. Safe to call outside the provider (no-op), so components
 * rendered in isolation — including existing unit tests — do not need rewiring.
 */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? NOOP_TOAST;
}
