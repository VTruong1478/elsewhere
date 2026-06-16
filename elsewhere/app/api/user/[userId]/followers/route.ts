import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const serviceClient = createServiceRoleClient();

  // Fetch follower IDs
  const { data: followRows, error: followError } = await serviceClient
    .from("user_follows")
    .select("follower_id")
    .eq("following_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (followError) {
    console.error("[user/followers] follow error:", followError);
    return NextResponse.json(
      { data: null, error: followError.message ?? "Failed to load followers" },
      { status: 500 },
    );
  }

  if (!followRows?.length) {
    return NextResponse.json({ data: [], error: null });
  }

  const followerIds = followRows.map((r) => r.follower_id as string);

  const { data: profileRows, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", followerIds);

  if (profileError) {
    console.error("[user/followers] profiles error:", profileError);
    return NextResponse.json(
      { data: null, error: profileError.message ?? "Failed to load follower profiles" },
      { status: 500 },
    );
  }

  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p]),
  );

  const data = followerIds
    .map((id) => {
      const p = profileById.get(id);
      if (!p) return null;
      return {
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return NextResponse.json({ data, error: null });
}
