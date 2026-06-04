import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/places/[id]/vibe-photo
 * Body: { ref: string, attribution: object | null }
 * Updates only vibe_photo_ref and vibe_photo_attribution for the place.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { ref?: string; attribution?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const ref =
    body.ref != null && typeof body.ref === "string" ? body.ref.trim() : null;
  const attribution = body.attribution ?? null;

  const { error } = await supabase
    .from("places")
    .update({
      vibe_photo_ref: ref || null,
      vibe_photo_attribution: attribution,
    })
    .eq("id", id);

  if (error) {
    console.error("[vibe-photo] update error:", error);
    return NextResponse.json(
      { error: "Failed to update place" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
