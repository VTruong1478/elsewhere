import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasDevBypassCookie, tryGetOrCreateDevAuthUser } from "@/lib/devAuth";

// Called by the client after the initial social feed query resolves.
// Sequencing this after the query ensures the cutoff timestamp used for
// the initial fetch (the old last_feed_view_at) is not overwritten before
// the feed items are determined.
export async function POST() {
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
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/feed-viewed")
      : null);

  if (!actingUser) {
    return NextResponse.json({ data: null, error: null });
  }

  await serviceClient
    .from("profiles")
    .update({ last_feed_view_at: new Date().toISOString() })
    .eq("id", actingUser.id);

  return NextResponse.json({ data: null, error: null });
}
