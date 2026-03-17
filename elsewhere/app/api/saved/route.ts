import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { place_id } = body as { place_id?: string };

  if (!place_id || typeof place_id !== "string") {
    return NextResponse.json(
      { error: "place_id is required" },
      { status: 400 },
    );
  }

  const serviceClient = createServiceRoleClient();
  const { data: place, error: placeError } = await serviceClient
    .from("places")
    .select("id, is_active")
    .eq("id", place_id)
    .maybeSingle();

  if (placeError || !place) {
    return NextResponse.json({ error: "Place not found" }, { status: 400 });
  }

  if (!place.is_active) {
    return NextResponse.json(
      { error: "Cannot save an inactive place" },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase
    .from("saved")
    .upsert({ user_id: user.id, place_id }, { onConflict: "user_id,place_id" });

  if (insertError) {
    console.error("[saved] insert error:", insertError);
    return NextResponse.json(
      { error: insertError.message ?? "Failed to save place" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
