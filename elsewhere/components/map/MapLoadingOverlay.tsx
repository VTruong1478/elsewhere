"use client";

import { Loader2 } from "lucide-react";

/** Top-centered loading indicator over the map (search debounce, location, or feed fetch). */
export function MapLoadingOverlay({
  label = "Loading places…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-[min(18vh,104px)] ${className ?? ""}`.trim()}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-8 rounded-radius-md  bg-surface px-12 py-12 shadow-map backdrop-blur-sm">
        <Loader2
          size={28}
          className="shrink-0 animate-spin text-primary"
          aria-hidden
        />
        <span className="text-ui-label-m text-text-secondary">
          {label}
        </span>
      </div>
    </div>
  );
}
