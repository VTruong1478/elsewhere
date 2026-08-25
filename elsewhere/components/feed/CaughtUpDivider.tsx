"use client";

import { Loader2 } from "lucide-react";

/**
 * End-of-list marker shared by the social feed and the places feed.
 *
 * `hasOlder` controls whether the manual "View older" affordance appears. The
 * social feed sets it because it soft-caps its initial batch and lets you pull
 * older ratings on demand; the places feed leaves it false because it pages
 * automatically on scroll, so reaching this divider already means the end.
 */
export function CaughtUpDivider({
  hasOlder,
  onLoadOlder,
  isLoading,
}: {
  hasOlder: boolean;
  onLoadOlder?: () => void;
  isLoading?: boolean;
}) {
  return (
    <div className="flex items-center gap-12 py-8">
      <div className="h-px flex-1 bg-surface-alt" />
      <div className="flex shrink-0 flex-col items-center gap-4">
        <span className="text-body-s text-text-tertiary">
          You&apos;re all caught up
        </span>
        {hasOlder && (
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoading}
            className="text-body-s text-accent disabled:opacity-50"
            aria-label="View older ratings"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              "View older"
            )}
          </button>
        )}
      </div>
      <div className="h-px flex-1 bg-surface-alt" />
    </div>
  );
}
