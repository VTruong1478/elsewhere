"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { AddMissingPlaceModal } from "@/components/feed/AddMissingPlaceModal";

export function FeedEmptyState({
  submittedFromSearch,
}: {
  submittedFromSearch?: string;
} = {}) {
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);

  return (
    <>
      <div className="rounded-radius-md bg-surface shadow-map p-24">
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
            onClick={() => setAddPlaceOpen(true)}
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
