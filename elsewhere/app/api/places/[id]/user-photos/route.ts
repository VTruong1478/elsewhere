import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizePlaceId } from "@/lib/placeId";

const BUCKET = "user-photos";

function isUserPhotoFile(name: string): boolean {
  if (!name || name.startsWith(".")) return false;
  return /\.(jpe?g|webp)$/i.test(name);
}

/**
 * GET /api/places/[id]/user-photos
 * Lists objects under user-photos/{place_id}/ and returns public URLs (newest first).
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
  const { data: files, error } = await supabase.storage.from(BUCKET).list(
    placeId,
    {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    },
  );

  if (error) {
    console.error("[user-photos list]", error);
    return NextResponse.json(
      { error: error.message ?? "List failed" },
      { status: 500 },
    );
  }

  const urls = (files ?? [])
    .filter((f) => f.name && isUserPhotoFile(f.name))
    .map((f) => {
      const objectPath = `${placeId}/${f.name}`;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      return data.publicUrl;
    });

  return NextResponse.json({ urls });
}
