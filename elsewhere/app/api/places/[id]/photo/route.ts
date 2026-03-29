import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isValidGooglePlacesPhotoRef } from "@/lib/googlePlacePhoto";

/**
 * GET /api/places/[id]/photo
 * Resolves the stored Google photo ref for an active place and redirects to
 * `/api/place-photo`. Anonymous users may load images for public feed cards;
 * inactive places return 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;
  const serviceClient = createServiceRoleClient();

  const { data: place } = await serviceClient
    .from("places")
    .select("google_photo_ref, is_active")
    .eq("id", placeId)
    .maybeSingle();

  if (!place?.is_active) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
  }

  const ref = place.google_photo_ref?.trim();
  if (!ref || !isValidGooglePlacesPhotoRef(ref)) {
    return NextResponse.json(
      { error: "Photo unavailable" },
      { status: 404 },
    );
  }

  const redirectUrl = new URL(
    `/api/place-photo?ref=${encodeURIComponent(ref)}`,
    request.url,
  );
  return NextResponse.redirect(redirectUrl);
}
