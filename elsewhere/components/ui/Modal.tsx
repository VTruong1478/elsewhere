"use client";

import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  contentClassName = "",
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  contentClassName?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-16">
      <div
        className="absolute inset-0 modal-overlay"
        aria-hidden
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <div
        className={`scrollbar-hide relative z-10 flex max-h-[min(90dvh,640px)] w-full max-w-md flex-col overflow-y-auto rounded-radius-md bg-surface p-16 ${contentClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

