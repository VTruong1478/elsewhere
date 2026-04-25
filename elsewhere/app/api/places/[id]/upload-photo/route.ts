import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cookies } from "next/headers";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import { PHOTO_MAX_SIZE_BYTES } from "@/lib/photoUpload";

const BUCKET = "user-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png"];

function getExt(mime: string): string {
  if (mime === "image/png") return "png";
  return "jpg";
}

/**
 * POST /api/places/[id]/upload-photo
 * Multipart form with "photo" file.
 * Uploads to user-photos/{place_id}/{user_id}-{timestamp}.{ext}
 * Returns { path: "user-photos/..." } for use in rating photo_path.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;

  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const serviceClient = createServiceRoleClient();
  const actingUser = user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "route.ts")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Check place exists
  const { data: place } = await serviceClient
    .from("places")
    .select("id, is_active")
    .eq("id", placeId)
    .maybeSingle();

  if (!place || !place.is_active) {
    return NextResponse.json(
      { error: "Place not found or inactive" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 },
    );
  }

  const file = formData.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "photo file is required" },
      { status: 400 },
    );
  }

  if (file.size > PHOTO_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Photo must be under 10MB" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Photo must be JPEG or PNG" },
      { status: 400 },
    );
  }

  const ext = getExt(file.type);
  const storagePath = `${placeId}/${actingUser.id}-${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[upload-photo] storage error:", uploadError);
    return NextResponse.json(
      { error: uploadError.message ?? "Upload failed" },
      { status: 500 },
    );
  }

  const fullPath = `${BUCKET}/${uploadData.path}`;
  return NextResponse.json({ path: fullPath });
}
