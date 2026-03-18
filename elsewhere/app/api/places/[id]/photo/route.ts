import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * GET /api/places/[id]/photo
 * Uses the stored `places.google_photo_ref` and redirects to the existing
 * Google photo proxy route `/api/place-photo?ref=...`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;
  const serviceClient = createServiceRoleClient();

  const { data: place } = await serviceClient
    .from("places")
    .select("google_photo_ref")
    .eq("id", placeId)
    .maybeSingle();

  const ref = place?.google_photo_ref?.trim();
  if (!ref) {
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

