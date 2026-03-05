"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, Suspense } from "react";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { FeedEmptyState } from "@/components/feed/EmptyState";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPanel } from "@/components/map/MapPanel";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";

// Fallback when location is denied/unavailable so the feed still shows seeded data (e.g. Atlanta)
const FALLBACK_CENTER = { lat: 33.749, lng: -84.388 };
// Larger radius when using fallback so all seeded Atlanta-area places (can be 10+ mi apart) show
const FALLBACK_RADIUS_MILES = 25;

type LocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

function useUserLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ status: "loading" });
  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setState({ status: "denied" }),
    );
  }, []);
  return state;
}

function fetchFeed(params: {
  lat: number;
  lng: number;
  q: string;
  filter: string;
  radius_miles?: number;
}): Promise<FeedItem[]> {
  const sp = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.q) sp.set("q", params.q);
  if (params.filter) sp.set("filter", params.filter);
  if (params.radius_miles != null) sp.set("radius_miles", String(params.radius_miles));
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
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "";
  const locationState = useUserLocation();
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();

  const coords =
    locationState.status === "ready"
      ? { lat: locationState.lat, lng: locationState.lng }
      : locationState.status === "denied" || locationState.status === "unavailable"
        ? FALLBACK_CENTER
        : null;

  const usingFallbackCoords =
    (locationState.status === "denied" || locationState.status === "unavailable") &&
    coords != null;

  const query = useQuery({
    queryKey: ["feed", coords?.lat, coords?.lng, q, filter, usingFallbackCoords],
    queryFn: () =>
      fetchFeed({
        lat: coords!.lat,
        lng: coords!.lng,
        q,
        filter,
        radius_miles: usingFallbackCoords ? FALLBACK_RADIUS_MILES : undefined,
      }),
    enabled: coords != null,
  });

  const places: FeedItem[] = query.data ?? [];
  const onSelectPlace = useCallback(
    (id: string) => setSelectedPlaceId(id),
    [setSelectedPlaceId],
  );

  // Scroll feed to the selected card when selection changes (e.g. from map marker click)
  useEffect(() => {
    if (!selectedPlaceId) return;
    const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedPlaceId]);

  const showSkeletons =
    locationState.status === "loading" || (coords != null && query.isLoading);
  const showEnableLocation =
    locationState.status === "unavailable" || locationState.status === "denied";
  const showResults = coords != null && query.isSuccess;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col md:flex-row">
      <div className="scrollbar-hide flex min-h-0 w-full flex-col overflow-y-auto md:max-w-md md:flex-shrink-0">
        <div className="shrink-0 space-y-4 p-4 md:p-6">
          <SearchBar />
          <FilterChips />
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-6">
          {showSkeletons && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          )}
          {showEnableLocation && !usingFallbackCoords && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="font-lora text-heading-m text-text mb-2">
                Location required
              </p>
              <p className="text-body-m text-text-secondary max-w-sm">
                Enable location access so we can show third spaces near you. We
                don&apos;t use a default location.
              </p>
            </div>
          )}
          {usingFallbackCoords && (
            <p className="text-body-s text-text-tertiary px-4 py-2 text-center">
              Showing places near Atlanta. Enable location to see spots near you.
            </p>
          )}
          {coords != null && query.isError && (
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
          {showResults && places.length === 0 && <FeedEmptyState />}
          {showResults && places.length > 0 && (
            <div className="space-y-4">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Mobile: map strip below feed */}
      <div className="block h-[280px] w-full flex-shrink-0 md:hidden">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={coords ?? undefined}
        />
      </div>
      {/* Desktop: map panel fills right column */}
      <MapPanel
        places={places}
        selectedPlaceId={selectedPlaceId}
        onSelectPlace={onSelectPlace}
        center={coords ?? undefined}
      />
    </div>
  );
}

function FeedPageFallback() {
  return (
    <>
      <div className="flex min-h-0 w-full flex-col overflow-hidden md:max-w-md md:flex-shrink-0 md:overflow-y-auto">
        <div className="shrink-0 space-y-4 p-4 md:p-6">
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
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 md:px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="hidden h-full min-h-0 flex-1 md:block bg-surface-alt" />
    </>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageFallback />}>
      <FeedContent />
    </Suspense>
  );
}
