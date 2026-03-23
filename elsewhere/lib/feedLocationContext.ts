import { ANNANDALE_FALLBACK, isNearNorthernVirginia } from "@/lib/locationRegion";
import type { FeedItem } from "@/types/feed";

export type UserLocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

export const LOCATION_STATUS_CASE1 =
  "Showing places near Northern Virginia. Enable location to see spots near you.";
export const LOCATION_STATUS_CASE2 = "Showing places near you.";
export const LOCATION_STATUS_CASE3 =
  "Elsewhere is only available in Northern Virginia right now. Showing places near Northern Virginia instead.";
export const LOCATION_STATUS_CASE4 =
  "No places found near you. Try zooming out.";

export type FeedLocationCase = 1 | 2 | 3 | 4;

/**
 * Coordinates for GET /api/feed — depends only on permission + region, never on
 * prior feed results (so the first request is correct).
 */
export function getFeedRequestCoords(locationState: UserLocationState): {
  feedCoords: { lat: number; lng: number };
  feedQueryEnabled: boolean;
} {
  if (locationState.status === "loading") {
    return { feedCoords: ANNANDALE_FALLBACK, feedQueryEnabled: false };
  }
  if (
    locationState.status === "denied" ||
    locationState.status === "unavailable"
  ) {
    return { feedCoords: ANNANDALE_FALLBACK, feedQueryEnabled: true };
  }
  const { lat, lng } = locationState;
  if (!isNearNorthernVirginia(lat, lng)) {
    return { feedCoords: ANNANDALE_FALLBACK, feedQueryEnabled: true };
  }
  return { feedCoords: { lat, lng }, feedQueryEnabled: true };
}

export function computeFeedLocationContext(
  locationState: UserLocationState,
  places: FeedItem[],
  feedQuery: { isSuccess: boolean; isLoading: boolean },
  q: string,
  filter: string,
): {
  feedCoords: { lat: number; lng: number };
  mapCenter: { lat: number; lng: number };
  showUserLocationDot: boolean;
  userLocationForDot: { lat: number; lng: number } | null;
  statusText: string | null;
  feedQueryEnabled: boolean;
  locationCase: FeedLocationCase | null;
} {
  const { feedCoords, feedQueryEnabled } = getFeedRequestCoords(locationState);

  if (locationState.status === "loading") {
    return {
      feedCoords,
      mapCenter: ANNANDALE_FALLBACK,
      showUserLocationDot: false,
      userLocationForDot: null,
      statusText: null,
      feedQueryEnabled,
      locationCase: null,
    };
  }

  if (
    locationState.status === "denied" ||
    locationState.status === "unavailable"
  ) {
    return {
      feedCoords,
      mapCenter: ANNANDALE_FALLBACK,
      showUserLocationDot: false,
      userLocationForDot: null,
      statusText: LOCATION_STATUS_CASE1,
      feedQueryEnabled,
      locationCase: 1,
    };
  }

  const { lat, lng } = locationState;
  const inNoVA = isNearNorthernVirginia(lat, lng);

  if (!inNoVA) {
    return {
      feedCoords,
      mapCenter: ANNANDALE_FALLBACK,
      showUserLocationDot: false,
      userLocationForDot: null,
      statusText: LOCATION_STATUS_CASE3,
      feedQueryEnabled,
      locationCase: 3,
    };
  }

  const emptySearch = !q.trim() && !filter;
  const isCase4 =
    feedQuery.isSuccess &&
    !feedQuery.isLoading &&
    places.length === 0 &&
    emptySearch;

  if (isCase4) {
    return {
      feedCoords,
      mapCenter: { lat, lng },
      showUserLocationDot: true,
      userLocationForDot: { lat, lng },
      statusText: LOCATION_STATUS_CASE4,
      feedQueryEnabled,
      locationCase: 4,
    };
  }

  return {
    feedCoords,
    mapCenter: { lat, lng },
    showUserLocationDot: true,
    userLocationForDot: { lat, lng },
    statusText: LOCATION_STATUS_CASE2,
    feedQueryEnabled,
    locationCase: 2,
  };
}
