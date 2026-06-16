import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  // Viewer auth is optional — unauthenticated users can view profiles
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewer =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "user/profile")
      : null);

  const [
    { data: profile },
    { count: ratingsCount },
    { count: photosCount },
    { count: savedCount },
    { count: followersCount },
    { count: followingCount },
    { data: followRow },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("photo_path", "is", null),
    serviceClient
      .from("saved")
      .select("place_id", { count: "exact", head: true })
      .eq("user_id", userId),
    serviceClient
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", userId),
    serviceClient
      .from("user_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", userId),
    viewer
      ? serviceClient
          .from("user_follows")
          .select("follower_id")
          .eq("follower_id", viewer.id)
          .eq("following_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!profile) {
    return NextResponse.json(
      { data: null, error: "User not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      id: profile.id,
      full_name: profile.full_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      stats: {
        placesRated: ratingsCount ?? 0,
        photosUploaded: photosCount ?? 0,
        placesSaved: savedCount ?? 0,
        followersCount: followersCount ?? 0,
        followingCount: followingCount ?? 0,
      },
      is_following: followRow != null,
    },
    error: null,
  });
}
