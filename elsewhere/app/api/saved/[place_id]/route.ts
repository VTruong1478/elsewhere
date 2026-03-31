import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cookies } from "next/headers";
import { getOrCreateDevAuthUser, hasDevBypassCookie } from "@/lib/devAuth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id: placeId } = await params;

  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const serviceClient = createServiceRoleClient();
  const actingUser = user ?? (devBypass ? await getOrCreateDevAuthUser(serviceClient) : null);

  if (!actingUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { data, error } = await serviceClient
    .from("saved")
    .delete()
    .eq("user_id", actingUser.id)
    .eq("place_id", placeId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[saved] delete error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to unsave place" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Saved entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
