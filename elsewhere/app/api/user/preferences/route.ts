import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cookies } from "next/headers";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";

export async function PATCH(request: NextRequest) {
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

  const writer = user ? supabase : serviceClient;
  const { error } = await writer
    .from("user_preferences")
    .upsert(
      {
        user_id: actingUser.id,
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

