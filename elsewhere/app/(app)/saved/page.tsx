"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeedItem } from "@/types/feed";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPin } from "lucide-react";
import { usePlaceStore } from "@/store/usePlaceStore";

async function fetchSavedPlaces(): Promise<FeedItem[]> {
  const res = await fetch("/api/saved", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : res.statusText,
    );
  }
  return Array.isArray(body?.data) ? body.data : [];
}

function SavedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-16 text-center">
      <MapPin
        className="mb-8 text-text-tertiary"
        size={48}
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="mb-4 font-lora text-heading-m text-text">
        No saved spots yet
      </p>
      <p className="max-w-sm text-body-m text-text-secondary">
        Explore the feed and tap the bookmark icon to save places you want to
        try.
      </p>
    </div>
  );
}

/**
 * Desktop: 5:8 split (13-column proportion per product spec) — saved list
 * scrolls on the left, map fixed on the right. Mobile: list scrolls, map strip
 * below (same idea as feed + map). Matches frontend-plan scroll rules.
 */
export default function SavedPage() {
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();
  const savedQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: fetchSavedPlaces,
  });

  const places = savedQuery.data ?? [];
  const isLoading = savedQuery.isLoading;
  const errMsg =
    savedQuery.isError && savedQuery.error instanceof Error
      ? savedQuery.error.message
      : savedQuery.isError
        ? "Something went wrong."
        : null;

  const mapCenter = useMemo(() => {
    if (places.length === 0) return undefined;
    let lat = 0;
    let lng = 0;
    for (const p of places) {
      lat += p.lat;
      lng += p.lng;
    }
    return { lat: lat / places.length, lng: lng / places.length };
  }, [places]);

  const onSelectPlace = useCallback(
    (id: string) => setSelectedPlaceId(id),
    [setSelectedPlaceId],
  );

  useEffect(() => {
    if (!selectedPlaceId) return;
    const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPlaceId]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-background md:grid md:grid-cols-[5fr_8fr] md:overflow-hidden">
      {/* Saved panel: 5/13 width on desktop — matches feed left column behavior */}
      <div className="scrollbar-hide flex min-h-0 flex-col overflow-y-auto md:min-h-0">
        <div className="shrink-0 px-16 pt-16">
          <h1 className="font-lora text-heading-l text-text">Saved</h1>
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-16 py-8">
          {errMsg && (
            <p className="mb-12 rounded-radius-md bg-surface px-12 py-12 text-body-m text-text-secondary">
              {errMsg}
            </p>
          )}
          {isLoading && (
            <div className="space-y-12">
              {Array.from({ length: 4 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          )}
          {!isLoading &&
            !savedQuery.isError &&
            places.length === 0 && <SavedEmptyState />}
          {!isLoading && !savedQuery.isError && places.length > 0 && (
            <div className="space-y-12">
              {places.map((place, index) => (
                <PlaceCard
                  key={place.id ? place.id : `saved-${index}`}
                  place={place}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map panel: 8/13 width on desktop; short strip on mobile */}
      <div className="flex h-[280px] w-full shrink-0 md:h-full md:min-h-0">
        <div className="h-full w-full min-h-0 overflow-hidden">
          <FeedMap
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={onSelectPlace}
            center={mapCenter}
          />
        </div>
      </div>
    </div>
  );
}
