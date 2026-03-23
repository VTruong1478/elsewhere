"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { FeedEmptyState } from "@/components/feed/EmptyState";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPanel } from "@/components/map/MapPanel";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";

// Fallback when location is denied/unavailable so the feed still shows seeded data (e.g. Northern VA)
const FALLBACK_CENTER = { lat: 33.749, lng: -84.388 };
// Larger radius when using fallback so all seeded nova area places (can be 10+ mi apart) show
const FALLBACK_RADIUS_MILES = 25;
const COORDS_CACHE_KEY = "elsewhere:lastCoords";
const MEANINGFUL_DISTANCE_METERS = 200; // If moved less than this, don't refetch.

type LocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

const LOCATION_TIMEOUT_MS = 5_000;

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function useUserLocation(): LocationState {
  function readCachedCoords(): { lat: number; lng: number } | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(COORDS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
      const lat = typeof parsed?.lat === "number" ? parsed.lat : NaN;
      const lng = typeof parsed?.lng === "number" ? parsed.lng : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  const cachedCoords = readCachedCoords();
  const [state, setState] = useState<LocationState>(() =>
    cachedCoords
      ? { status: "ready", lat: cachedCoords.lat, lng: cachedCoords.lng }
      : { status: "loading" },
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      if (!cachedCoords) setState({ status: "unavailable" });
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (!cachedCoords) setState({ status: "denied" });
    }, LOCATION_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          window.sessionStorage.setItem(
            COORDS_CACHE_KEY,
            JSON.stringify({ lat: fresh.lat, lng: fresh.lng }),
          );
        } catch {
          // Ignore cache write failures
        }
        if (cachedCoords) {
          const movedMeters = distanceMeters(cachedCoords, fresh);
          // Only update coords (and refetch feed) if the user moved meaningfully.
          if (movedMeters >= MEANINGFUL_DISTANCE_METERS) {
            setState({ status: "ready", lat: fresh.lat, lng: fresh.lng });
          }
          return;
        }
        setState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (!cachedCoords) setState({ status: "denied" });
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [cachedCoords]);
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
  if (params.radius_miles != null)
    sp.set("radius_miles", String(params.radius_miles));
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
  // pathname may include a basePath (e.g. `/elsewhere/map`), so match last segment.
  const lastPathSegment =
    pathname?.split("/").filter(Boolean).pop() ?? undefined;
  const isMapTabActive = lastPathSegment === "map";

  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "";
  const locationState = useUserLocation();
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();

  const coords =
    locationState.status === "ready"
      ? { lat: locationState.lat, lng: locationState.lng }
      : locationState.status === "denied" ||
          locationState.status === "unavailable"
        ? FALLBACK_CENTER
        : null;

  const usingFallbackCoords =
    (locationState.status === "denied" ||
      locationState.status === "unavailable") &&
    coords != null;

  const query = useQuery({
    queryKey: [
      "feed",
      coords?.lat,
      coords?.lng,
      q,
      filter,
      usingFallbackCoords,
    ],
    queryFn: () =>
      fetchFeed({
        lat: coords!.lat,
        lng: coords!.lng,
        q,
        filter,
        // Debug/MVP behavior: always use the larger radius so desktop shows all seeded places.
        radius_miles: FALLBACK_RADIUS_MILES,
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
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPlaceId]);

  const showSkeletons =
    locationState.status === "loading" || (coords != null && query.isLoading);
  const showEnableLocation =
    locationState.status === "unavailable" || locationState.status === "denied";
  const showResults = coords != null && query.isSuccess;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col md:grid md:grid-cols-[5fr_8fr] md:overflow-hidden">
      <div className="scrollbar-hide flex min-h-0 w-full flex-col overflow-y-auto md:min-h-0">
        <div className="shrink-0 pt-16">
          <div className="px-16">
            <SearchBar />
          </div>
          <FilterChips />
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-16 py-8">
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
          {usingFallbackCoords && !showEnableLocation && (
            <p className="text-body-s text-text-tertiary px-4 py-2 text-center">
              Currently showing places in Northern Virginia.
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
            <div className="space-y-12">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Right column: mobile map strip when Map tab; desktop map (5/8 grid, 8fr) */}
      <div className="flex min-h-0 flex-col md:h-full md:min-h-0">
        {isMapTabActive && (
          <div className="h-[280px] w-full shrink-0 md:hidden">
            <FeedMap
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={onSelectPlace}
              center={coords ?? undefined}
            />
          </div>
        )}
        <MapPanel
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={coords ?? undefined}
        />
      </div>
    </div>
  );
}

function FeedPageFallback() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col md:grid md:grid-cols-[5fr_8fr] md:overflow-hidden">
      <div className="flex min-h-0 w-full flex-col overflow-hidden md:min-h-0 md:overflow-y-auto">
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
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 md:px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="hidden min-h-0 md:block md:h-full bg-surface-alt animate-pulse" />
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
