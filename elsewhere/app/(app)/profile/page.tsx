import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { hasDevBypassCookie, tryGetOrCreateDevAuthUser } from "@/lib/devAuth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ProfileContent } from "@/components/profile/ProfileContent";

async function getProfileData() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const serviceClient = createServiceRoleClient();

  const actingUser =
    user ??
    (devBypass ? await tryGetOrCreateDevAuthUser(serviceClient, "profile/page") : null);

  if (!actingUser) {
    redirect(`/signup?next=${encodeURIComponent("/profile")}`);
  }

  const [
    { data: profile },
    { count: ratingsCount },
    { count: photosCount },
    { count: savedCount },
    { count: followersCount },
    { count: followingCount },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("full_name, avatar_url, username")
      .eq("id", actingUser.id)
      .maybeSingle(),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", actingUser.id),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", actingUser.id)
      .not("photo_path", "is", null),
    serviceClient
      .from("saved")
      .select("place_id", { count: "exact", head: true })
      .eq("user_id", actingUser.id),
    serviceClient
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", actingUser.id),
    serviceClient
      .from("user_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", actingUser.id),
  ]);

  const email = actingUser.email ?? "";
  const fallbackName = email.includes("@") ? email.split("@")[0] : email;
  const fullName = (
    profile?.full_name ||
    fallbackName ||
    "Your profile"
  ).trim();

  return {
    userId: actingUser.id,
    username: (profile?.username as string | null) ?? null,
    fullName,
    email,
    avatarUrl: profile?.avatar_url ?? null,
    stats: {
      placesRated: ratingsCount ?? 0,
      photosUploaded: photosCount ?? 0,
      placesSaved: savedCount ?? 0,
      followersCount: followersCount ?? 0,
      followingCount: followingCount ?? 0,
    },
  };
}

export default async function ProfilePage() {
  const { userId, username, fullName, email, avatarUrl, stats } = await getProfileData();

  return (
    <main className="min-h-screen w-full bg-background px-16 pt-40 pb-24">
      <div className="mx-auto max-w-md">
        <ProfileContent
          userId={userId}
          username={username}
          fullName={fullName}
          email={email}
          avatarUrl={avatarUrl}
          stats={stats}
          isOwnProfile={true}
        />
      </div>
    </main>
  );
}
