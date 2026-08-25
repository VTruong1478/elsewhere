"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DesktopPlaceDetailPanel } from "@/components/feed/DesktopPlaceDetailPanel";
import { MapPanel } from "@/components/map/MapPanel";
import { feedItemForDetailMap } from "@/lib/detailMapPlace";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import { normalizePlaceId } from "@/lib/placeId";

type PlaceDetailPageDesktopProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
};

/**
 * Desktop route layout for `/places/[id]`.
 *
 * Same composition the feed uses for a selected place — full-bleed map with the
 * detail panel overlaid on the left half — and the desktop counterpart of the
 * mobile route (map background + bottom sheet). Previously the panel was a bare
 * `max-w-2xl` column whose `mx-auto` was cancelled by the flex-row `<main>`, so
 * a shared link or a refresh landed on a 600px panel pinned to the left edge of
 * a 1440px viewport with the rest of the screen empty.
 *
 * The panel fetches its own data; this wrapper reads the same cache entry so the
 * map pin can show the place without a second request.
 */
export function PlaceDetailPageDesktop({
  placeId,
  initialCenter,
}: PlaceDetailPageDesktopProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceFeedBack = searchParams.get("back_to") === "feed";
  const normalizedId = useMemo(() => normalizePlaceId(placeId), [placeId]);

  const { data: detail } = useQuery({
    queryKey: placeDetailQueryKey(normalizedId ?? "__invalid__"),
    queryFn: () => fetchPlaceDetail(normalizedId!),
    enabled: !!normalizedId,
  });

  const place = detail?.place ?? null;

  const coords = useMemo(() => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : initialCenter;
  }, [place?.lat, place?.lng, initialCenter]);

  const avgOverall = useMemo(() => {
    const raw = detail?.place_stats?.avg_overall_rating;
    if (raw == null) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [detail?.place_stats?.avg_overall_rating]);

  const mapPlaces = useMemo(
    () => [feedItemForDetailMap(normalizedId ?? placeId, coords, place, avgOverall)],
    [normalizedId, placeId, coords, place, avgOverall],
  );

  function handleDismiss() {
    if (forceFeedBack) {
      router.push("/feed");
      return;
    }
    router.back();
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <MapPanel
        places={mapPlaces}
        selectedPlaceId={normalizedId ?? placeId}
        onSelectPlace={() => {}}
        center={coords}
        showUserLocationDot={false}
        // Keep the pin clear of the panel, same as the feed's selected state.
        selectedMarkerScreenXRatio={0.75}
      />
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="absolute bottom-0 left-0 top-0 flex w-1/2 flex-col p-16">
          <div className="pointer-events-auto flex h-0 min-h-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-radius-md shadow-map">
              <DesktopPlaceDetailPanel
                placeId={placeId}
                initialCenter={coords}
                onDismiss={handleDismiss}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
