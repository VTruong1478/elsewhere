import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizePlaceId } from "@/lib/placeId";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";

const BUCKET = "user-photos";

function isUserPhotoFile(name: string): boolean {
  if (!name || name.startsWith(".")) return false;
  return /\.(jpe?g|webp)$/i.test(name);
}

/**
 * GET /api/places/[id]/user-photos
 * Returns photo URLs for a place: user-uploaded photos (storage) first,
 * then Google photos (places.google_photo_urls) after.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const placeId = normalizePlaceId(id);
  if (!placeId) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const [storageResult, placeResult] = await Promise.all([
    supabase.storage.from(BUCKET).list(placeId, {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    }),
    supabase
      .from("places")
      .select("google_photo_urls")
      .eq("id", placeId)
      .maybeSingle<{ google_photo_urls: string[] | null }>(),
  ]);

  // Storage error is non-fatal: still return Google photos.
  if (storageResult.error) {
    console.error("[user-photos list]", storageResult.error);
  }
  if (placeResult.error) {
    console.error("[user-photos place query]", placeResult.error);
  }

  const userPhotoUrls = storageResult.error
    ? []
    : (storageResult.data ?? [])
        .filter((f) => f.name && isUserPhotoFile(f.name))
        .map((f) => userPhotoProxyUrl(`${placeId}/${f.name}`));

  const googlePhotoUrls: string[] = (
    placeResult.data?.google_photo_urls ?? []
  ).filter((u): u is string => typeof u === "string" && u.length > 0);

  return NextResponse.json({ urls: [...userPhotoUrls, ...googlePhotoUrls] });
}
