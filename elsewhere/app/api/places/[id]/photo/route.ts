import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  fetchFreshGooglePhotoRef,
  fetchGooglePlacePhotoMedia,
  isValidGooglePlacesPhotoRef,
} from "@/lib/googlePlacePhoto";

const DEFAULT_MAX_WIDTH = 800;

/**
 * GET /api/places/[id]/photo
 * Streams Google Places photo media for an active place. Prefers admin vibe_photo_ref,
 * then google_photo_ref. Stored refs expire; falls back to Place Details via google_place_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;
  const serviceClient = createServiceRoleClient();

  type PlacePhotoRow = {
    google_photo_ref: string | null;
    vibe_photo_ref?: string | null;
    google_place_id: string | null;
    is_active: boolean;
  };

  let place: PlacePhotoRow | null = null;
  const withVibe = await serviceClient
    .from("places")
    .select("google_photo_ref, vibe_photo_ref, google_place_id, is_active")
    .eq("id", placeId)
    .maybeSingle();

  if (withVibe.error?.code === "42703") {
    const withoutVibe = await serviceClient
      .from("places")
      .select("google_photo_ref, google_place_id, is_active")
      .eq("id", placeId)
      .maybeSingle();
    place = (withoutVibe.data as PlacePhotoRow | null) ?? null;
  } else {
    place = (withVibe.data as PlacePhotoRow | null) ?? null;
  }

  if (!place?.is_active) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Place photo not configured" },
      { status: 503 },
    );
  }

  const candidates = [
    (place.vibe_photo_ref as string | null)?.trim(),
    (place.google_photo_ref as string | null)?.trim(),
  ].filter((r): r is string => !!r && isValidGooglePlacesPhotoRef(r));

  let maxWidthPx = DEFAULT_MAX_WIDTH;
  const maxParam = request.nextUrl.searchParams.get("maxWidthPx");
  if (maxParam != null) {
    const n = parseInt(maxParam, 10);
    if (!Number.isNaN(n)) {
      maxWidthPx = Math.min(4800, Math.max(100, n));
    }
  }

  let media = null;
  for (const ref of candidates) {
    media = await fetchGooglePlacePhotoMedia(ref, key, maxWidthPx);
    if (media) break;
  }

  const googlePlaceId = (place.google_place_id as string | null)?.trim();
  if (!media && googlePlaceId) {
    const freshRef = await fetchFreshGooglePhotoRef(googlePlaceId, key);
    if (freshRef) {
      media = await fetchGooglePlacePhotoMedia(freshRef, key, maxWidthPx);
      if (media && freshRef !== place.google_photo_ref) {
        void serviceClient
          .from("places")
          .update({ google_photo_ref: freshRef })
          .eq("id", placeId);
      }
    }
  }

  if (!media) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
  }

  return new NextResponse(media.body, {
    status: 200,
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
