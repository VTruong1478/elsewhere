import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
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

  const { radius_miles } = body as { radius_miles?: unknown };
  const radiusNumber = Number(radius_miles);

  if (
    radius_miles == null ||
    typeof radiusNumber !== "number" ||
    !Number.isFinite(radiusNumber) ||
    radiusNumber < 1 ||
    radiusNumber > 25
  ) {
    return NextResponse.json(
      {
        error:
          "radius_miles is required and must be a number between 1 and 25",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        radius_miles: radiusNumber,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[user/preferences] upsert error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to update preferences" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    radius_miles: radiusNumber,
  });
}

