"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { AddMissingPlaceModal } from "@/components/feed/AddMissingPlaceModal";
import { ensureAuthForGatedAction } from "@/lib/authGate";

export type FeedEmptyStateVariant = "card" | "plain";

export function FeedEmptyState({
  submittedFromSearch,
  /** `card`: floating panel on map. `plain`: no surface, shadow, or radius (feed list). */
  variant = "card",
}: {
  submittedFromSearch?: string;
  variant?: FeedEmptyStateVariant;
} = {}) {
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const router = useRouter();

  const source = variant === "plain" ? "feed" : "map";

  const shellClass =
    variant === "plain"
      ? "bg-transparent p-24"
      : "rounded-radius-md bg-surface shadow-map p-24";

  return (
    <>
      <div className={shellClass}>
        <div className="flex flex-col items-center justify-center text-center">
          <MapPin
            className="text-text-tertiary mb-4"
            size={48}
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="font-lora text-heading-m text-text mb-2">
            No places found
          </p>
          <p className="text-body-m text-text-secondary max-w-sm">
            Try adjusting your search or filters.
          </p>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const returnPath =
                  typeof window !== "undefined"
                    ? `${window.location.pathname}${window.location.search}`
                    : "/feed";
                if (
                  !(await ensureAuthForGatedAction(router.push, {
                    action_type: "submit_missing_place",
                    source,
                    returnPath,
                  }))
                ) {
                  return;
                }
                setAddPlaceOpen(true);
              })();
            }}
            className="mx-auto mt-8 text-body-m text-accent text-link"
          >
            Add a missing place
          </button>
        </div>
      </div>
      <AddMissingPlaceModal
        open={addPlaceOpen}
        onClose={() => setAddPlaceOpen(false)}
        submittedFromSearch={submittedFromSearch}
      />
    </>
  );
}
