"use client";

import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  Suspense,
} from "react";
import { ArrowLeft } from "lucide-react";
import { SearchBar } from "@/components/feed/SearchBar";
import { FilterChips } from "@/components/feed/FilterChips";
import { FeedMap } from "@/components/map/FeedMap";
import { MapPlacePreview } from "@/components/map/MapPlacePreview";
import { PlaceDetailMobile } from "@/components/places/PlaceDetailMobile";
import { Button } from "@/components/ui/Button";
import { usePlaceStore } from "@/store/usePlaceStore";
import type { FeedItem } from "@/types/feed";
import {
  computeFeedLocationContext,
  getFeedRequestCoords,
} from "@/lib/feedLocationContext";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import { normalizePlaceId, samePlaceId } from "@/lib/placeId";
import { useUserLocation } from "@/hooks/useUserLocation";

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
}): Promise<FeedItem[]> {
  const sp = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.q) sp.set("q", params.q);
  if (params.filter) sp.set("filter", params.filter);
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
  const { selectedPlaceId, setSelectedPlaceId, setHoveredPlaceId } =
    usePlaceStore();

  // Fresh map tab: clear selection/hover once on mount only. Do not depend on Zustand
  // setter identity — if deps ever change between renders, this would re-run after a
  // marker tap and clear selectedPlaceId before GET /api/places/[id] completes.
  useLayoutEffect(() => {
    setSelectedPlaceId(null);
    setHoveredPlaceId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once when MapContent mounts
  }, []);
  const radiusMilesRef = useRef<number | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobileSelectionOffsetPx, setMobileSelectionOffsetPx] = useState(0);

  const feedRequest = getFeedRequestCoords(locationState);

  const query = useQuery({
    queryKey: [
      "feed",
      "map",
      feedRequest.feedCoords.lat,
      feedRequest.feedCoords.lng,
      q,
      filter,
      // eslint-disable-next-line react-hooks/refs
      radiusMilesRef.current,
    ],
    queryFn: () =>
      fetchFeed({
        lat: feedRequest.feedCoords.lat,
        lng: feedRequest.feedCoords.lng,
        q,
        filter,
      }),
    enabled: feedRequest.feedQueryEnabled,
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

  useEffect(() => {
    function recalcSelectionOffset() {
      const h = window.innerHeight;
      // FeedMap internally applies half of this as upward pan; half screen gives ~25% up-shift.
      setMobileSelectionOffsetPx(Math.round(h * 0.5));
    }
    recalcSelectionOffset();
    window.addEventListener("resize", recalcSelectionOffset);
    return () => window.removeEventListener("resize", recalcSelectionOffset);
  }, []);

  const places: FeedItem[] = query.data ?? [];
  const selectedPlace = selectedPlaceId
    ? places.find((p) => samePlaceId(p.id, selectedPlaceId))
    : null;

  const prefetchPlaceDetail = useCallback(
    (markerPlaceId: string) => {
      const nid = normalizePlaceId(markerPlaceId);
      if (!nid) return;
      void queryClient.prefetchQuery({
        queryKey: placeDetailQueryKey(nid),
        queryFn: () => fetchPlaceDetail(nid),
      });
    },
    [queryClient],
  );

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
  const onDismissPlaceDetail = useCallback(
    () => setSelectedPlaceId(null),
    [setSelectedPlaceId],
  );

  return (
    <div className="relative flex min-h-0 flex-1 w-full flex-col">
      {/* On desktop: show the top header. */}
      <div className="hidden shrink-0 px-16 pt-16 lg:block">
        {locationCtx.statusText && (
          <p className="text-heading-m text-text mb-8">
            {locationCtx.statusText}
          </p>
        )}
        <div className="mb-8">
          <SearchBar />
        </div>
        <FilterChips />
      </div>

      {/* On mobile/tablet: search + filters like feed, then map fills the rest. */}
      <div className="lg:hidden fixed inset-0 z-0 flex flex-col bg-background">
        <div className="shrink-0 pt-16">
          <div className="px-16">
            <SearchBar />
          </div>
          <FilterChips />
        </div>
        {!selectedPlaceId && locationCtx.statusText && (
          <p className="text-body-s text-text-tertiary shrink-0 px-16 pb-8 text-center">
            {locationCtx.statusText}
          </p>
        )}
        <div className="relative min-h-0 flex-1">
          <FeedMap
            places={places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={onSelectPlace}
            center={locationCtx.mapCenter}
            onZoomEnd={handleZoomEnd}
            showUserLocationDot={locationCtx.showUserLocationDot}
            userLocationForDot={locationCtx.userLocationForDot ?? undefined}
            centerVerticalOffsetPx={
              selectedPlaceId ? mobileSelectionOffsetPx : 0
            }
            onPlaceMarkerHover={prefetchPlaceDetail}
          />
          {selectedPlaceId && (
            <>
              <PlaceDetailMobile
                placeId={selectedPlaceId}
                initialCenter={
                  selectedPlace
                    ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
                    : locationCtx.mapCenter
                }
                renderMap={false}
                previewFeedItem={selectedPlace ?? null}
                onDismiss={onDismissPlaceDetail}
              />
              <div className="pointer-events-auto absolute left-3 top-3 z-40">
                <Button
                  variant="secondaryIcon"
                  type="button"
                  onClick={onDismissPlaceDetail}
                  className="shadow-map"
                  aria-label="Back to map"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop: keep the original layout. */}
      <div className="relative min-h-0 flex-1 hidden lg:block">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={locationCtx.mapCenter}
          onZoomEnd={handleZoomEnd}
          showUserLocationDot={locationCtx.showUserLocationDot}
          userLocationForDot={locationCtx.userLocationForDot ?? undefined}
          onPlaceMarkerHover={prefetchPlaceDetail}
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
