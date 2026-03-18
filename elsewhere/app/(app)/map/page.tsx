"use client";

import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPlacePreview } from "@/components/map/MapPlacePreview";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";

const FALLBACK_CENTER = { lat: 38.8304, lng: -77.1941 };
const FALLBACK_RADIUS_MILES = 25;

type LocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

const LOCATION_TIMEOUT_MS = 10_000;

function useUserLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ status: "loading" });
  useEffect(() => {
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "unavailable" });
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "denied" });
    }, LOCATION_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ status: "denied" });
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);
  return state;
}

function zoomToRadiusMiles(zoom: number): number {
  const table: Record<number, number> = {
    16: 2,
    15: 3,
    14: 5,
    13: 10,
    12: 15,
    11: 25,
    10: 25,
  };
  const z = Math.round(zoom);
  const radius = table[z] ?? (z > 16 ? 1 : 25);
  return Math.max(1, Math.min(25, radius));
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

function MapContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "";
  const locationState = useUserLocation();
  const queryClient = useQueryClient();
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();
  const radiusMilesRef = useRef<number | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      "map",
      coords?.lat,
      coords?.lng,
      q,
      filter,
      usingFallbackCoords,
      // eslint-disable-next-line react-hooks/refs
      radiusMilesRef.current,
    ],
    queryFn: () =>
      fetchFeed({
        lat: coords!.lat,
        lng: coords!.lng,
        q,
        filter,
        // Debug/MVP behavior: always use the larger radius so map/feed stays consistent.
        radius_miles: FALLBACK_RADIUS_MILES,
      }),
    enabled: coords != null,
  });

  const patchRadiusMutation = useMutation({
    mutationFn: async (radius: number) => {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radius_miles: radius }),
      });
      if (!res.ok) throw new Error("Failed to update radius");
    },
  });

  const handleZoomEnd = useCallback(
    (zoom: number) => {
      const newRadius = zoomToRadiusMiles(zoom);
      if (radiusMilesRef.current === newRadius) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        radiusMilesRef.current = newRadius;
        patchRadiusMutation.mutate(newRadius, {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["feed"],
              refetchType: "active",
            });
          },
        });
      }, 1000);
    },
    [patchRadiusMutation, queryClient],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const places: FeedItem[] = query.data ?? [];
  const selectedPlace = selectedPlaceId
    ? places.find((p) => p.id === selectedPlaceId)
    : null;

  const locationHeader = usingFallbackCoords
    ? "Near you · Northern Virginia"
    : "Near you";

  const onSelectPlace = useCallback(
    (id: string) => setSelectedPlaceId(id),
    [setSelectedPlaceId],
  );

  return (
    <div className="relative flex min-h-0 flex-1 w-full flex-col">
      {/* On desktop: show the top header. */}
      <div className="hidden shrink-0 px-16 pt-16 lg:block">
        <p className="text-heading-m text-text mb-8">{locationHeader}</p>
        <div className="mb-8">
          <SearchBar />
        </div>
        <FilterChips />
      </div>

      {/* On mobile/tablet: make the map fill the entire viewport height. */}
      <div className="lg:hidden fixed inset-0">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={coords ?? FALLBACK_CENTER}
          onZoomEnd={handleZoomEnd}
        />
        {selectedPlace && (
          <div className="absolute bottom-16 left-16 right-16 z-30">
            <MapPlacePreview place={selectedPlace} />
          </div>
        )}
      </div>

      {/* Desktop: keep the original layout. */}
      <div className="relative min-h-0 flex-1 hidden lg:block">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={coords ?? FALLBACK_CENTER}
          onZoomEnd={handleZoomEnd}
        />
        {selectedPlace && (
          <div className="absolute bottom-16 left-16 right-16 z-30">
            <MapPlacePreview place={selectedPlace} />
          </div>
        )}
      </div>
    </div>
  );
}

function MapPageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-alt">
      <p className="text-body-m text-text-secondary">Loading map…</p>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<MapPageFallback />}>
      <MapContent />
    </Suspense>
  );
}
