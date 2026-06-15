import { ANNANDALE_FALLBACK, isNearNorthernVirginia } from "@/lib/locationRegion";
import type { FeedItem } from "@/types/feed";

export type UserLocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

export const LOCATION_STATUS_CASE1_BEFORE =
  "Showing places near Northern Virginia. ";
export const LOCATION_STATUS_CASE1_LINK = "Enable location";
export const LOCATION_STATUS_CASE1_AFTER = " to see spots near you.";
/** Text before the waitlist link (case 3). */
export const LOCATION_STATUS_CASE3_BEFORE =
  "Elsewhere is only available in Northern Virginia right now. ";
export const LOCATION_STATUS_CASE3_LINK = "Add your area to the waitlist.";
export const AREA_WAITLIST_URL =
  "https://elsewhere-landing-one.vercel.app/area-waitlist";
export const LOCATION_STATUS_CASE4 =
  "No places found nearby. Try searching from a different spot.";

export type FeedLocationStatusMessage =
  | { kind: "plain"; text: string }
  | { kind: "waitlist" }
  | { kind: "request-location" };

export type FeedLocationCase = 1 | 2 | 3 | 4;

/** Case 3 (outside NoVA, Annandale fallback): wide enough radius to include all seeded NoVA places. */
export const CASE3_FEED_RADIUS_MILES = 75;

/**
 * Coordinates for GET /api/feed — depends only on permission + region, never on
 * prior feed results (so the first request is correct).
 */
export function getFeedRequestCoords(locationState: UserLocationState): {
  feedCoords: { lat: number; lng: number };
  feedQueryEnabled: boolean;
  /**
   * When set, the client must pass this as `radius_miles` on the feed request.
   * Case 3 only — otherwise the API falls back to user_preferences (Cases 1, 2, 4).
   */
  feedRadiusMiles: number | null;
} {
  if (locationState.status === "loading") {
    return {
      feedCoords: ANNANDALE_FALLBACK,
      feedQueryEnabled: false,
      feedRadiusMiles: null,
    };
  }
  if (
    locationState.status === "denied" ||
    locationState.status === "unavailable"
  ) {
    return {
      feedCoords: ANNANDALE_FALLBACK,
      feedQueryEnabled: true,
      feedRadiusMiles: null,
    };
  }
  const { lat, lng } = locationState;
  if (!isNearNorthernVirginia(lat, lng)) {
    return {
      feedCoords: ANNANDALE_FALLBACK,
      feedQueryEnabled: true,
      feedRadiusMiles: CASE3_FEED_RADIUS_MILES,
    };
  }
  return {
    feedCoords: { lat, lng },
    feedQueryEnabled: true,
    feedRadiusMiles: null,
  };
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
  locationStatusMessage: FeedLocationStatusMessage | null;
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
      locationStatusMessage: null,
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
      locationStatusMessage: { kind: "request-location" },
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
      locationStatusMessage: { kind: "waitlist" },
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
      locationStatusMessage: { kind: "plain", text: LOCATION_STATUS_CASE4 },
      feedQueryEnabled,
      locationCase: 4,
    };
  }

  return {
    feedCoords,
    mapCenter: { lat, lng },
    showUserLocationDot: true,
    userLocationForDot: { lat, lng },
    locationStatusMessage: null,
    feedQueryEnabled,
    locationCase: 2,
  };
}
