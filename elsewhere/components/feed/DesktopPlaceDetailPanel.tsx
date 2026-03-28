"use client";

/**
 * Desktop feed only: empty shell for place detail (lg+). Spans columns 5–8 of the
 * parent 12-column row (4 cols after the 4-col feed); tokens per frontend-plan.
 */
export function DesktopPlaceDetailPanel() {
  return (
    <div
      className="m-16 min-h-0 flex-1 rounded-radius-md bg-surface shadow-map"
      role="region"
      aria-label="Place details"
    />
  );
}
