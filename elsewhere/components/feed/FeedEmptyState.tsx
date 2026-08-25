"use client";

import { useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const source = variant === "plain" ? "feed" : "map";

  // "Open now" with nothing open is not the same failure as "we have no such
  // place". Outside business hours it matches *everything* in the catalog at
  // once, and the generic copy then misreads the situation twice over: it
  // implies the search failed, and it invites the user to submit a place that
  // already exists. Only treat it as the closed-hours case when the filter is
  // the sole thing narrowing the results.
  const isClosedHours =
    (searchParams.get("filter") ?? "") === "open_now" &&
    !(submittedFromSearch ?? "").trim();

  function showAllSpots() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("filter");
    const qs = next.toString();
    const basePath = pathname?.startsWith("/map") ? "/map" : "/feed";
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const shellClass =
    variant === "plain"
      ? "bg-transparent p-24"
      : "rounded-radius-md bg-surface shadow-map p-24";

  if (isClosedHours) {
    return (
      <div className={shellClass}>
        <div className="flex flex-col items-center justify-center text-center">
          <Clock
            className="text-text-tertiary mb-4"
            size={48}
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="font-lora text-heading-m text-text mb-2">
            Nothing&rsquo;s open right now
          </p>
          <p className="text-body-m text-text-secondary max-w-sm">
            Everywhere nearby is closed at this hour. Browse all spots &mdash;
            each one shows when it opens next.
          </p>
          <Button
            type="button"
            onClick={showAllSpots}
            className="mt-16"
          >
            See all spots
          </Button>
        </div>
      </div>
    );
  }

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
