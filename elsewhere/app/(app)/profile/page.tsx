import { redirect } from "next/navigation";
import { User2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogoutButton } from "./LogoutButton";

async function getProfileData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceRoleClient();

  const [
    { data: profile },
    { count: ratingsCount },
    { count: photosCount },
    { count: savedCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("photo_path", "is", null),
    serviceClient
      .from("saved")
      .select("place_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const email = user.email ?? "";
  const fallbackName = email.includes("@") ? email.split("@")[0] : email;
  const fullName = (
    profile?.full_name ||
    fallbackName ||
    "Your profile"
  ).trim();

  return {
    fullName,
    email,
    avatarUrl: profile?.avatar_url ?? null,
    stats: {
      placesRated: ratingsCount ?? 0,
      photosUploaded: photosCount ?? 0,
      placesSaved: savedCount ?? 0,
    },
  };
}

export default async function ProfilePage() {
  const { fullName, email, avatarUrl, stats } = await getProfileData();

  return (
    <main className="min-h-screen w-full bg-background px-16 py-24">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {/* Avatar */}
        <div className="mb-16 flex h-40 w-40 items-center justify-center rounded-full bg-surface-alt text-text shadow-map">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <User2 size={20} className="text-primary" aria-hidden />
          )}
        </div>

        {/* Name and email */}
        <h1 className="mb-4 text-heading-l text-text">{fullName}</h1>
        {email && (
          <p className="mb-24 text-body-m text-text-secondary">{email}</p>
        )}

        {/* Activity heading */}
        <div className="mb-12 w-full text-left">
          <h2 className="text-heading-m text-text">Your activity</h2>
        </div>

        {/* Stat cards */}
        <div className="mb-16 grid w-full grid-cols-3 gap-8">
          <div className="rounded-radius-md bg-surface px-12 py-16 text-center">
            <p className="text-display-l text-text">{stats.placesRated ?? 0}</p>
            <p className="mt-4 text-body-s text-text-secondary">Places rated</p>
          </div>
          <div className="rounded-radius-md bg-surface px-12 py-16 text-center">
            <p className="text-display-l text-text">
              {stats.photosUploaded ?? 0}
            </p>
            <p className="mt-4 text-body-s text-text-secondary">
              Photos uploaded
            </p>
          </div>
          <div className="rounded-radius-md bg-surface px-12 py-16 text-center">
            <p className="text-display-l text-text">{stats.placesSaved ?? 0}</p>
            <p className="mt-4 text-body-s text-text-secondary">Places saved</p>
          </div>
        </div>

        {/* Logout */}
        <LogoutButton />
      </div>
    </main>
  );
}
