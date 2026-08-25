import type { FeedItem } from "@/types/feed";
import type { PlaceDetailResponse } from "@/types/placeDetail";

/**
 * Builds the single `FeedItem` the detail map renders a marker from — `FeedMap`
 * only draws pins from `places`, so a place-detail view needs one row for its
 * own subject. Match % comes from the average rating when there is one, and
 * stays `null` otherwise so the pin shows the unrated treatment rather than 0%.
 *
 * Shared by the desktop panel, the mobile sheet, and the `/places/[id]` desktop
 * route, which each used to carry a byte-identical private copy.
 */
export function feedItemForDetailMap(
  placeId: string,
  coords: { lat: number; lng: number },
  row: PlaceDetailResponse["place"] | null,
  avgOverall: number | null,
): FeedItem {
  const match =
    avgOverall != null && !Number.isNaN(avgOverall)
      ? Math.round(Math.min(5, Math.max(0, avgOverall)) * 20)
      : null;
  return {
    id: placeId,
    name: row?.name ?? "—",
    address: row?.address ?? "",
    lat: coords.lat,
    lng: coords.lng,
    place_type: row?.place_type ?? "",
    noise: null,
    tables: null,
    outlets: null,
    match_score_percent: match,
    why_matched: [],
    open_now: false,
    closes_at: null,
    closing_soon: false,
    open_late: false,
    pills: [],
  };
}
