import posthog from "posthog-js";
import type { FeedItem } from "@/types/feed";

export type AnalyticsSource = "feed" | "map" | "saved";

export type PlaceEventProps = {
  source?: AnalyticsSource;
  place_id?: string;
  place_name?: string;
  place_type?: string;
  has_photos?: boolean;
};

function isPostHogConfigured(): boolean {
  return Boolean(
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY,
  );
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

export function capturePlaceOpened(props: PlaceEventProps): void {
  captureEvent("place_opened", stripUndefined(props as Record<string, unknown>));
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
