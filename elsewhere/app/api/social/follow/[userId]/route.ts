import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/follow")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { data: null, error: "Authentication required" },
      { status: 401 },
    );
  }

  if (actingUser.id === targetUserId) {
    return NextResponse.json(
      { data: null, error: "Cannot follow yourself" },
      { status: 400 },
    );
  }

  const { error } = await serviceClient
    .from("user_follows")
    .upsert(
      { follower_id: actingUser.id, following_id: targetUserId },
      { onConflict: "follower_id,following_id" },
    );

  if (error) {
    console.error("[social/follow] insert error:", error);
    return NextResponse.json(
      { data: null, error: error.message ?? "Failed to follow" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: null, error: null });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/unfollow")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { data: null, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { error } = await serviceClient
    .from("user_follows")
    .delete()
    .eq("follower_id", actingUser.id)
    .eq("following_id", targetUserId);

  if (error) {
    console.error("[social/unfollow] delete error:", error);
    return NextResponse.json(
      { data: null, error: error.message ?? "Failed to unfollow" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: null, error: null });
}
