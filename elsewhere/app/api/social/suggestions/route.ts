import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasDevBypassCookie, tryGetOrCreateDevAuthUser } from "@/lib/devAuth";

export type SuggestionUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  follower_count: number;
};

export async function GET() {
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
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/suggestions")
      : null);

  if (!actingUser) {
    return NextResponse.json({ data: [], error: null });
  }

  const { data: follows } = await serviceClient
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", actingUser.id);

  const alreadyFollowingIds = new Set([
    actingUser.id,
    ...(follows ?? []).map((f) => f.following_id as string),
  ]);

  const { data: candidates } = await serviceClient
    .from("profiles")
    .select("id, username, avatar_url")
    .not("username", "is", null)
    .limit(50);

  const eligible = (candidates ?? []).filter(
    (p) => !alreadyFollowingIds.has(p.id as string),
  );

  if (!eligible.length) {
    return NextResponse.json({ data: [], error: null });
  }

  const eligibleIds = eligible.map((p) => p.id as string);

  const { data: followerRows } = await serviceClient
    .from("user_follows")
    .select("following_id")
    .in("following_id", eligibleIds);

  const followerCountById = new Map<string, number>();
  for (const row of followerRows ?? []) {
    const id = row.following_id as string;
    followerCountById.set(id, (followerCountById.get(id) ?? 0) + 1);
  }

  const suggestions: SuggestionUser[] = eligible
    .map((p) => ({
      id: p.id as string,
      username: p.username as string,
      avatar_url: (p.avatar_url as string | null) ?? null,
      follower_count: followerCountById.get(p.id as string) ?? 0,
    }))
    .sort((a, b) => b.follower_count - a.follower_count)
    .slice(0, 10);

  return NextResponse.json({ data: suggestions, error: null });
}
