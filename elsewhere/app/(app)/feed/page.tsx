"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { FeedEmptyState } from "@/components/feed/EmptyState";
import { LocationStatusMessageBody } from "@/components/feed/LocationStatusMessageBody";
import { FeedMap, DEFAULT_MAP_ZOOM } from "@/components/map/FeedMap";
import { MapLoadingOverlay } from "@/components/map/MapLoadingOverlay";
import { MapPanel } from "@/components/map/MapPanel";
import { DesktopPlaceDetailPanel } from "@/components/feed/DesktopPlaceDetailPanel";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";
import {
  computeFeedLocationContext,
  getFeedRequestCoords,
} from "@/lib/feedLocationContext";
import { useUserLocation } from "@/hooks/useUserLocation";
import { samePlaceId } from "@/lib/placeId";
import { captureFeedLoaded } from "@/lib/analytics";
import {
  TutorialModal,
  TUTORIAL_PENDING_KEY,
} from "@/components/onboarding/TutorialModal";

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

  // Pause auto-location when the onboarding tutorial is pending so the
  // browser permission dialog fires from the tutorial's Enable button (a user
  // gesture) rather than automatically on mount.
  const [locationEnabled, setLocationEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem(TUTORIAL_PENDING_KEY);
  });
  const locationState = useUserLocation({ skip: !locationEnabled });

  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();

  const [isLgDesktop, setIsLgDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLgDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  const selectedPlace = useMemo(() => {
    if (!selectedPlaceId) return null;
    return places.find((p) => samePlaceId(p.id, selectedPlaceId)) ?? null;
  }, [places, selectedPlaceId]);

  const desktopDetailCenter = useMemo(
    () =>
      selectedPlace
        ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
        : {
            lat: locationCtx.mapCenter.lat,
            lng: locationCtx.mapCenter.lng,
          },
    [selectedPlace, locationCtx.mapCenter.lat, locationCtx.mapCenter.lng],
  );

  const onSelectPlace = useCallback(
    (id: string) => setSelectedPlaceId(id),
    [setSelectedPlaceId],
  );

  useEffect(() => {
    if (!query.isSuccess || !locationCtx.feedQueryEnabled) return;
    captureFeedLoaded({
      source: "feed",
      result_count: places.length,
      has_query: Boolean(q.trim()),
      filter: filter || "all",
    });
  }, [query.isSuccess, locationCtx.feedQueryEnabled, places.length, q, filter]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPlaceId]);

  const showSkeletons =
    locationState.status === "loading" ||
    (locationCtx.feedQueryEnabled &&
      (query.isLoading || (!isLgDesktop && query.isFetching)));

  const showResults = locationCtx.feedQueryEnabled && query.isSuccess;

  const isCase4Empty =
    locationCtx.locationCase === 4 &&
    places.length === 0 &&
    !q.trim() &&
    !filter;

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-12 lg:overflow-hidden">
        <div className="scrollbar-hide flex min-h-0 w-full flex-col overflow-y-auto lg:col-span-4 lg:min-h-0">
          <div className="shrink-0">
            <div className="px-16 lg:pt-16">
              <SearchBar />
            </div>
            <FilterChips />
          </div>
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto py-4 px-16 pb-8">
            {locationCtx.locationStatusMessage && (
              <p className="text-body-s text-text-tertiary px-4 pb-8 text-center">
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
                <p className="text-body-m text-text-secondary max-w-sm mb-16">
                  {query.error?.message ?? "Something went wrong."}
                </p>
                <button
                  type="button"
                  onClick={() => query.refetch()}
                  className="rounded-radius-sm bg-primary px-8 py-8 text-ui-button text-text-inverse"
                >
                  Try again
                </button>
              </div>
            )}
            {showResults &&
              places.length === 0 &&
              !isCase4Empty &&
              !query.isLoading && (
                <FeedEmptyState
                  variant="plain"
                  submittedFromSearch={q.trim() || undefined}
                />
              )}
            {showResults && places.length > 0 && (
              <div className="space-y-12">
                {places.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="relative flex min-h-0 flex-col lg:col-span-8 lg:h-full lg:min-h-0">
          {isMapTabActive && (
            <div className="relative h-[280px] w-full shrink-0 md:hidden">
              <FeedMap
                places={places}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={onSelectPlace}
                center={locationCtx.mapCenter}
                zoom={DEFAULT_MAP_ZOOM}
                showUserLocationDot={locationCtx.showUserLocationDot}
                userLocationForDot={locationCtx.userLocationForDot ?? undefined}
                showRecenterButton
              />
              {locationCtx.feedQueryEnabled &&
              !isLgDesktop &&
              query.isFetching &&
              !query.isLoading ? (
                <MapLoadingOverlay />
              ) : null}
            </div>
          )}
          <MapPanel
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={onSelectPlace}
            center={locationCtx.mapCenter}
            showUserLocationDot={locationCtx.showUserLocationDot}
            userLocationForDot={locationCtx.userLocationForDot ?? undefined}
            selectedMarkerScreenXRatio={
              isLgDesktop && selectedPlaceId ? 0.75 : undefined
            }
            showPlacesLoading={
              !!(
                locationCtx.feedQueryEnabled &&
                isLgDesktop &&
                query.isFetching
              )
            }
          />
          {selectedPlaceId ? (
            <div className="pointer-events-none absolute inset-0 z-30 hidden lg:block">
              <div className="absolute bottom-0 left-0 top-0 flex w-1/2 flex-col p-16">
                <div className="pointer-events-auto flex h-0 min-h-0 flex-1 flex-col">
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-radius-md shadow-map">
                    <DesktopPlaceDetailPanel
                      placeId={selectedPlaceId}
                      initialCenter={desktopDetailCenter}
                      previewFeedItem={selectedPlace}
                      onDismiss={() => setSelectedPlaceId(null)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Onboarding tutorial — layered on top, does not affect feed behavior */}
      <TutorialModal onLocationEnabled={() => setLocationEnabled(true)} />
    </>
  );
}

function FeedPageFallback() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-12 lg:overflow-hidden">
      <div className="flex min-h-0 w-full flex-col overflow-hidden lg:col-span-4 lg:min-h-0 lg:overflow-y-auto">
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
      <div className="hidden min-h-0 lg:col-span-8 lg:block lg:h-full bg-surface-alt animate-pulse" />
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
