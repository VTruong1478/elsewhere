import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const serviceClient = createServiceRoleClient();

  // Fetch IDs of users that userId follows
  const { data: followRows, error: followError } = await serviceClient
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (followError) {
    console.error("[user/following] follow error:", followError);
    return NextResponse.json(
      { data: null, error: followError.message ?? "Failed to load following" },
      { status: 500 },
    );
  }

  if (!followRows?.length) {
    return NextResponse.json({ data: [], error: null });
  }

  const followingIds = followRows.map((r) => r.following_id as string);

  const { data: profileRows, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, avatar_url, username")
    .in("id", followingIds);

  if (profileError) {
    console.error("[user/following] profiles error:", profileError);
    return NextResponse.json(
      { data: null, error: profileError.message ?? "Failed to load following profiles" },
      { status: 500 },
    );
  }

  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p]),
  );

  const data = followingIds
    .map((id) => {
      const p = profileById.get(id);
      if (!p) return null;
      return {
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        username: (p.username as string | null) ?? null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return NextResponse.json({ data, error: null });
}
