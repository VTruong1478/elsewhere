import posthog from "posthog-js";
import type { FeedItem } from "@/types/feed";
import { safeInternalPath } from "@/lib/safeNextPath";

export type AnalyticsSource = "feed" | "map" | "saved";

export type PlaceAnalyticsPayload = {
  source: AnalyticsSource;
  place_id: string;
  place_name: string;
  place_type?: string;
  has_photos?: boolean;
};

function isPostHogConfigured(): boolean {
  return Boolean(
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY,
  );
}

/** Parse `source` query param on rate page or similar. */
export function parseAnalyticsSource(
  raw: string | null | undefined,
): AnalyticsSource | null {
  if (raw === "feed" || raw === "map" || raw === "saved") return raw;
  return null;
}

export function buildRateHref(
  placeId: string,
  placeName: string,
  source: AnalyticsSource,
  returnTo?: string | null,
): string {
  const sp = new URLSearchParams();
  sp.set("name", placeName);
  sp.set("source", source);
  const safeReturnTo = safeInternalPath(returnTo);
  if (safeReturnTo) {
    sp.set("return_to", safeReturnTo);
  }
  return `/places/${placeId}/rate?${sp.toString()}`;
}

export function getPlaceAnalyticsPayload(
  place: {
    id: string;
    name: string;
    place_type?: string;
    has_photos?: boolean;
  },
  source: AnalyticsSource,
): PlaceAnalyticsPayload {
  return {
    source,
    place_id: place.id,
    place_name: place.name,
    ...(place.place_type != null && place.place_type !== ""
      ? { place_type: place.place_type }
      : {}),
    ...(place.has_photos !== undefined ? { has_photos: place.has_photos } : {}),
  };
}

export function getPlaceAnalyticsPayloadFromFeedItem(
  place: FeedItem,
  source: AnalyticsSource,
): PlaceAnalyticsPayload {
  return getPlaceAnalyticsPayload(
    {
      id: place.id,
      name: place.name,
      place_type: place.place_type,
      has_photos: feedItemHasPhotos(place),
    },
    source,
  );
}

/** Rating / contribution events: fixed shape every time (avoids funnel gaps). */
export function getRatingPlaceAnalyticsPayload(
  place: {
    id: string;
    name: string;
    place_type: string;
    has_photos: boolean;
  },
  source: AnalyticsSource,
): PlaceAnalyticsPayload {
  return {
    source,
    place_id: place.id,
    place_name: place.name,
    place_type: place.place_type,
    has_photos: place.has_photos,
  };
}

/** True if the feed card / list item shows a hero or place photo. */
export function feedItemHasPhotos(place: FeedItem): boolean {
  return Boolean(
    (place.image_url && place.image_url.trim()) ||
      (place.google_photo_ref && place.google_photo_ref.trim()) ||
      (place.vibe_photo_path && place.vibe_photo_path.trim()) ||
      (place.vibe_photo_ref && place.vibe_photo_ref.trim()),
  );
}

/** Hero-style photos on GET /api/places/[id] `place` object. */
export function detailPlaceHasPhotos(place: {
  google_photo_ref?: string | null;
  vibe_photo_path?: string | null;
  vibe_photo_ref?: string | null;
} | null): boolean {
  if (!place) return false;
  return Boolean(
    place.google_photo_ref?.trim() ||
      place.vibe_photo_path?.trim() ||
      place.vibe_photo_ref?.trim(),
  );
}

export function analyticsSourceFromPathname(
  pathname: string | null | undefined,
): AnalyticsSource {
  if (pathname?.startsWith("/map")) return "map";
  if (pathname?.startsWith("/saved")) return "saved";
  return "feed";
}

export function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!isPostHogConfigured()) return;
  posthog.capture(event, properties);
}

export function capturePlaceOpened(
  place: FeedItem,
  source: AnalyticsSource,
): void {
  captureEvent(
    "place_opened",
    stripUndefined(getPlaceAnalyticsPayloadFromFeedItem(place, source) as Record<string, unknown>),
  );
}

export function capturePlaceSaved(
  place: {
    id: string;
    name: string;
    place_type?: string;
    has_photos?: boolean;
  },
  source: AnalyticsSource,
): void {
  captureEvent(
    "place_saved",
    stripUndefined(getPlaceAnalyticsPayload(place, source) as Record<string, unknown>),
  );
}

/** Rating funnel events — same payload shape as `getRatingPlaceAnalyticsPayload`. */
export function captureRatingFunnelEvent(
  eventName: "rating_started" | "photo_uploaded" | "rating_submitted",
  place: {
    id: string;
    name: string;
    place_type: string;
    has_photos: boolean;
  },
  source: AnalyticsSource,
): void {
  captureEvent(
    eventName,
    stripUndefined(
      getRatingPlaceAnalyticsPayload(place, source) as Record<string, unknown>,
    ),
  );
}

export function captureFiltersApplied(props: {
  source: AnalyticsSource;
  filter: string;
}): void {
  captureEvent("filters_applied", stripUndefined(props as Record<string, unknown>));
}

export function captureFeedLoaded(props: {
  source: AnalyticsSource;
  result_count: number;
  has_query: boolean;
  filter: string;
}): void {
  captureEvent("feed_loaded", stripUndefined(props as Record<string, unknown>));
}

function stripUndefined(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}
