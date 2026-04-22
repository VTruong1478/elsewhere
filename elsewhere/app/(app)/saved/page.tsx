"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeedItem } from "@/types/feed";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { MapPanel } from "@/components/map/MapPanel";
import { MapPin } from "lucide-react";
import { usePlaceStore } from "@/store/usePlaceStore";

async function fetchSavedPlaces(): Promise<FeedItem[]> {
  const res = await fetch("/api/saved", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await res.json();
  if (res.status === 401) {
    // Treat unauthenticated as "no saved places" to avoid noisy UI errors
    // when browsing without a session or when dev bypass is unavailable.
    return [];
  }
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
 * Layout mirrors the feed: single scrolling column on mobile/tablet; desktop (lg+)
 * uses the same 5:8 list + map split. Cards use the same tap behavior as feed
 * (mobile/tablet → /places/[id] with map-style detail).
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
    <div className="flex min-h-0 w-full flex-1 flex-col bg-background lg:grid lg:grid-cols-[5fr_8fr] lg:overflow-hidden">
      <div className="scrollbar-hide flex min-h-0 w-full flex-col overflow-y-auto lg:min-h-0">
        <div className="shrink-0 pt-16">
          <div className="px-16">
            <h1 className="font-lora text-heading-l text-text">Saved</h1>
          </div>
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-16 py-8">
          {errMsg && (
            <p className="mb-12 rounded-radius-md bg-surface px-12 py-12 text-body-m text-text-secondary">
              {errMsg}
            </p>
          )}
          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
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

      <div className="flex min-h-0 flex-col lg:h-full lg:min-h-0">
        <MapPanel
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={mapCenter}
          showUserLocationDot={false}
          showPlacesLoading={savedQuery.isFetching}
        />
      </div>
    </div>
  );
}
