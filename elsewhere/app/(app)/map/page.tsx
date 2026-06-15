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
import { LocationStatusMessageBody } from "@/components/feed/LocationStatusMessageBody";
import { FeedMap, DEFAULT_MAP_ZOOM } from "@/components/map/FeedMap";
import { MapLoadingOverlay } from "@/components/map/MapLoadingOverlay";
import { FeedEmptyState } from "@/components/feed/FeedEmptyState";
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
import { captureFeedLoaded } from "@/lib/analytics";

const MAP_SEARCH_DEBOUNCE_MS = 300;

type MapPanelState = "default" | "map_search_no_results";

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

function MapContent() {
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter") ?? "";
  // Do not auto-request geolocation on the map tab — that triggers the system
  // dialog on cold navigation (and feels like it fires before the page loads).
  // Permission is requested from the feed (`useUserLocation` default) or via
  // the map "locate" control (user gesture). Still use sessionStorage coords
  // when the user already granted on feed.
  const locationState = useUserLocation({ autoRequest: false });
  const queryClient = useQueryClient();
  const { selectedPlaceId, setSelectedPlaceId, setHoveredPlaceId } =
    usePlaceStore();

  /** Local search text on map only — not synced to URL (see SearchBar controlled mode). */
  const [mapSearchInput, setMapSearchInput] = useState("");
  const [debouncedMapQ, setDebouncedMapQ] = useState("");
  const [mapPanelState, setMapPanelState] =
    useState<MapPanelState>("default");
  const urlHydratedRef = useRef(false);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const q0 = searchParams.get("q") ?? "";
    if (q0) setMapSearchInput(q0);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedMapQ(mapSearchInput),
      MAP_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [mapSearchInput]);

  const handleMapSearchChange = useCallback((next: string) => {
    setMapSearchInput(next);
  }, []);

  const mapSearchPending =
    mapSearchInput.trim() !== debouncedMapQ.trim();

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

  /** Tailwind `lg` (1024px): mount exactly one FeedMap — mobile vs desktop branch. */
  const [isLg, setIsLg] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const feedRequest = getFeedRequestCoords(locationState);

  const query = useQuery({
    queryKey: [
      "feed",
      "map",
      feedRequest.feedCoords.lat,
      feedRequest.feedCoords.lng,
      feedRequest.feedRadiusMiles,
      debouncedMapQ,
      filter,
      radiusMilesRef.current,
    ],
    queryFn: () =>
      fetchFeed({
        lat: feedRequest.feedCoords.lat,
        lng: feedRequest.feedCoords.lng,
        q: debouncedMapQ,
        filter,
        radiusMiles: feedRequest.feedRadiusMiles,
      }),
    enabled: feedRequest.feedQueryEnabled,
    /** Keeps previous pins visible during zoom→radius refetch; avoids isLoading flash + empty map. */
    placeholderData: (previousData) => previousData,
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
              queryKey: ["feed", "map"],
              exact: false,
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

  useEffect(() => {
    if (!query.isSuccess || !feedRequest.feedQueryEnabled) return;
    captureFeedLoaded({
      source: "map",
      result_count: places.length,
      has_query: Boolean(debouncedMapQ.trim()),
      filter: filter || "all",
    });
  }, [
    query.isSuccess,
    feedRequest.feedQueryEnabled,
    places.length,
    debouncedMapQ,
    filter,
  ]);

  useEffect(() => {
    if (mapSearchPending) {
      setMapPanelState("default");
      return;
    }
    if (query.isFetching) {
      setMapPanelState("default");
      return;
    }
    const searchNoResults =
      debouncedMapQ.trim().length > 0 &&
      query.isSuccess &&
      places.length === 0;
    /** Filter chip with zero matches: show same empty card as search (incl. add-place modal) below `lg`. */
    const filterNoResultsMobile =
      !isLg &&
      filter.trim() !== "" &&
      feedRequest.feedQueryEnabled &&
      query.isSuccess &&
      places.length === 0;

    if (searchNoResults || filterNoResultsMobile) {
      setMapPanelState("map_search_no_results");
    } else {
      setMapPanelState("default");
    }
  }, [
    mapSearchPending,
    debouncedMapQ,
    filter,
    isLg,
    feedRequest.feedQueryEnabled,
    query.isFetching,
    query.isSuccess,
    places.length,
  ]);

  useEffect(() => {
    if (mapPanelState === "map_search_no_results") {
      setSelectedPlaceId(null);
    }
  }, [mapPanelState, setSelectedPlaceId]);

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
    debouncedMapQ,
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

  const mapAutoFitResetKey = `${debouncedMapQ}\0${filter}`;

  const feedMapSharedProps = {
    places,
    selectedPlaceId,
    onSelectPlace,
    center: locationCtx.mapCenter,
    zoom: DEFAULT_MAP_ZOOM,
    onZoomEnd: handleZoomEnd,
    showUserLocationDot: locationCtx.showUserLocationDot,
    userLocationForDot: locationCtx.userLocationForDot ?? undefined,
    onPlaceMarkerHover: prefetchPlaceDetail,
    autoFitBoundsOnPlacesChange: false as const,
    autoFitBoundsResetKey: mapAutoFitResetKey,
    showRecenterButton: true as const,
  } as const;

  // isFetching covers first paint and refetches (e.g. filter) while placeholderData may
  // keep previous pins; search debounce and location still gate loading separately.
  const showMapLoading =
    mapSearchPending ||
    locationState.status === "loading" ||
    (feedRequest.feedQueryEnabled && query.isFetching);

  return (
    <div className="relative flex min-h-0 flex-1 w-full flex-col">
      {isLg ? (
        <>
          <div className="shrink-0 px-16 pt-16">
            {locationCtx.locationStatusMessage && (
              <p className="text-heading-m text-text mb-8">
                <LocationStatusMessageBody
                  message={locationCtx.locationStatusMessage}
                />
              </p>
            )}
            <div className="mb-8">
              <SearchBar
                value={mapSearchInput}
                onValueChange={handleMapSearchChange}
              />
            </div>
            <FilterChips />
          </div>

          <div className="relative min-h-0 flex-1">
            <FeedMap {...feedMapSharedProps} />
            {showMapLoading ? <MapLoadingOverlay /> : null}
            {mapPanelState === "map_search_no_results" ? (
              <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center px-16">
                <FeedEmptyState
                  submittedFromSearch={debouncedMapQ.trim() || undefined}
                />
              </div>
            ) : (
              selectedPlace && (
                <div className="absolute bottom-16 left-16 right-16 z-30">
                  <MapPlacePreview place={selectedPlace} />
                </div>
              )
            )}
          </div>
        </>
      ) : (
        <div className="fixed inset-0 z-0 flex flex-col bg-background">
          <div className="shrink-0 pt-16">
            <div className="px-16">
              <SearchBar
                value={mapSearchInput}
                onValueChange={handleMapSearchChange}
              />
            </div>
            <FilterChips />
          </div>
          {!selectedPlaceId && locationCtx.locationStatusMessage && (
            <p className="text-body-s text-text-tertiary shrink-0 px-16 pb-8 text-center">
              <LocationStatusMessageBody
                message={locationCtx.locationStatusMessage}
              />
            </p>
          )}
          <div className="relative min-h-0 flex-1">
            <FeedMap
              {...feedMapSharedProps}
              centerVerticalOffsetPx={
                selectedPlaceId && mapPanelState !== "map_search_no_results"
                  ? mobileSelectionOffsetPx
                  : 0
              }
            />
            {showMapLoading ? <MapLoadingOverlay /> : null}
            {mapPanelState === "map_search_no_results" ? (
              <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center px-16">
                <FeedEmptyState
                  submittedFromSearch={debouncedMapQ.trim() || undefined}
                />
              </div>
            ) : (
              selectedPlaceId && (
                <>
                  <PlaceDetailMobile
                    key={selectedPlaceId}
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
              )
            )}
          </div>
        </div>
      )}
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
