import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import { ProfileContent } from "@/components/profile/ProfileContent";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  // Get current viewer (auth is optional for public profile)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewer =
    user ??
    (devBypass ? await tryGetOrCreateDevAuthUser(serviceClient, "public-profile") : null);

  // Fetch profile + stats in parallel
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
      .select("id, full_name, avatar_url, username")
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
    // Check if current viewer follows this user
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
    return (
      <main className="min-h-screen w-full bg-background px-16 pt-40 pb-24">
        <div className="mx-auto max-w-md text-center">
          <p className="font-lora text-heading-m text-text">User not found</p>
          <p className="mt-8 text-body-m text-text-secondary">
            This profile doesn&apos;t exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  const fullName = (profile.full_name ?? "").trim() || "Anonymous";
  const username = (profile.username as string | null) ?? null;
  const isOwnProfile = viewer?.id === userId;
  const isFollowing = followRow != null;

  return (
    <main className="min-h-screen w-full bg-background px-16 pt-40 pb-24">
      <div className="mx-auto max-w-md">
        <ProfileContent
          userId={userId}
          username={username}
          fullName={fullName}
          email={null}
          avatarUrl={profile.avatar_url ?? null}
          stats={{
            placesRated: ratingsCount ?? 0,
            photosUploaded: photosCount ?? 0,
            placesSaved: savedCount ?? 0,
            followersCount: followersCount ?? 0,
            followingCount: followingCount ?? 0,
          }}
          isOwnProfile={isOwnProfile}
          initialIsFollowing={isFollowing}
        />
      </div>
    </main>
  );
}
