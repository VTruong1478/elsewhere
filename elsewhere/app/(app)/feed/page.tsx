"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, Suspense } from "react";
import { usePathname } from "next/navigation";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { FeedEmptyState } from "@/components/feed/EmptyState";
import { LocationStatusMessageBody } from "@/components/feed/LocationStatusMessageBody";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPanel } from "@/components/map/MapPanel";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";
import {
  computeFeedLocationContext,
  getFeedRequestCoords,
} from "@/lib/feedLocationContext";
import { useUserLocation } from "@/hooks/useUserLocation";

function fetchFeed(params: {
  lat: number;
  lng: number;
  q: string;
  filter: string;
  /** Case 3 only; omit so API uses user_preferences. */
  radiusMiles?: number | null;
}): Promise<FeedItem[]> {
  const sp = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.q) sp.set("q", params.q);
  if (params.filter) sp.set("filter", params.filter);
  if (params.radiusMiles != null) {
    sp.set("radius_miles", String(params.radiusMiles));
  }
  return fetch(`/api/feed?${sp.toString()}`).then(async (res) => {
    const body = await res.json();
    if (!res.ok) {
      throw new Error(
        typeof body?.error === "string" ? body.error : res.statusText,
      );
    }
    return Array.isArray(body?.data) ? body.data : (body ?? []);
  });
}

function FeedContent() {
  const pathname = usePathname();
  const lastPathSegment =
    pathname?.split("/").filter(Boolean).pop() ?? undefined;
  const isMapTabActive = lastPathSegment === "map";

  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "";
  const locationState = useUserLocation();
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();

  const feedRequest = getFeedRequestCoords(locationState);

  const query = useQuery({
    queryKey: [
      "feed",
      feedRequest.feedCoords.lat,
      feedRequest.feedCoords.lng,
      feedRequest.feedRadiusMiles,
      q,
      filter,
    ],
    queryFn: () =>
      fetchFeed({
        lat: feedRequest.feedCoords.lat,
        lng: feedRequest.feedCoords.lng,
        q,
        filter,
        radiusMiles: feedRequest.feedRadiusMiles,
      }),
    enabled: feedRequest.feedQueryEnabled,
  });

  const places: FeedItem[] = query.data ?? [];

  const locationCtx = computeFeedLocationContext(
    locationState,
    places,
    { isSuccess: query.isSuccess, isLoading: query.isLoading },
    q,
    filter,
  );

  const onSelectPlace = useCallback(
    (id: string) => setSelectedPlaceId(id),
    [setSelectedPlaceId],
  );

  useEffect(() => {
    if (!selectedPlaceId) return;
    const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPlaceId]);

  const showSkeletons =
    locationState.status === "loading" ||
    (locationCtx.feedQueryEnabled && query.isLoading);

  const showResults = locationCtx.feedQueryEnabled && query.isSuccess;

  const isCase4Empty =
    locationCtx.locationCase === 4 &&
    places.length === 0 &&
    !q.trim() &&
    !filter;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-[5fr_8fr] lg:overflow-hidden">
      <div className="scrollbar-hide flex min-h-0 w-full flex-col overflow-y-auto lg:min-h-0">
        <div className="shrink-0">
          <div className="px-16">
            <SearchBar />
          </div>
          <FilterChips />
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-16 py-8">
          {locationCtx.locationStatusMessage && (
            <p className="text-body-s text-text-tertiary px-4 py-2 text-center">
              <LocationStatusMessageBody
                message={locationCtx.locationStatusMessage}
              />
            </p>
          )}
          {showSkeletons && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          )}
          {locationCtx.feedQueryEnabled && query.isError && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="font-lora text-heading-m text-text mb-2">
                Couldn’t load the feed
              </p>
              <p className="text-body-m text-text-secondary mb-4">
                {query.error?.message ?? "Something went wrong."}
              </p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="rounded-radius-sm bg-accent px-4 py-2 text-ui-button text-text-inverse"
              >
                Try again
              </button>
            </div>
          )}
          {showResults &&
            places.length === 0 &&
            !isCase4Empty &&
            !query.isLoading && <FeedEmptyState />}
          {showResults && places.length > 0 && (
            <div className="space-y-12">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-col lg:h-full lg:min-h-0">
        {isMapTabActive && (
          <div className="h-[280px] w-full shrink-0 md:hidden">
            <FeedMap
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={onSelectPlace}
              center={locationCtx.mapCenter}
              showUserLocationDot={locationCtx.showUserLocationDot}
              userLocationForDot={locationCtx.userLocationForDot ?? undefined}
            />
          </div>
        )}
        <MapPanel
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={locationCtx.mapCenter}
          showUserLocationDot={locationCtx.showUserLocationDot}
          userLocationForDot={locationCtx.userLocationForDot ?? undefined}
        />
      </div>
    </div>
  );
}

function FeedPageFallback() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-[5fr_8fr] lg:overflow-hidden">
      <div className="flex min-h-0 w-full flex-col overflow-hidden lg:min-h-0 lg:overflow-y-auto">
        <div className="shrink-0 space-y-4 p-4">
          <div className="h-12 rounded-radius-sm bg-surface-alt animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 w-20 rounded-radius-sm bg-surface-alt animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 lg:px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="hidden min-h-0 lg:block lg:h-full bg-surface-alt animate-pulse" />
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageFallback />}>
      <FeedContent />
    </Suspense>
  );
}
