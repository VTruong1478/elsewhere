import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import {
  fetchRatingSocialCounts,
  isUuid,
  ratingIsVisible,
} from "@/lib/ratingSocial";

async function resolveContext(ratingId: string) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (hasDevBypassCookie(cookieStore)
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/likes")
      : null);

  if (!actingUser) {
    return {
      error: NextResponse.json(
        { data: null, error: "Authentication required" },
        { status: 401 },
      ),
    } as const;
  }

  if (!isUuid(ratingId)) {
    return {
      error: NextResponse.json(
        { data: null, error: "Invalid rating id" },
        { status: 400 },
      ),
    } as const;
  }

  return { actingUser, serviceClient } as const;
}

/** Fresh counts so the client reconciles instead of trusting its optimistic value. */
async function countsResponse(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  ratingId: string,
  viewerId: string,
) {
  const counts = await fetchRatingSocialCounts(
    serviceClient,
    [ratingId],
    viewerId,
  );
  const row = counts.get(ratingId);
  return NextResponse.json({
    data: {
      rating_id: ratingId,
      like_count: row?.like_count ?? 0,
      viewer_has_liked: row?.viewer_has_liked ?? false,
    },
    error: null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ratingId: string }> },
) {
  const { ratingId } = await params;
  const ctx = await resolveContext(ratingId);
  if ("error" in ctx) return ctx.error;

  const { exists } = await ratingIsVisible(ctx.serviceClient, ratingId);
  if (!exists) {
    return NextResponse.json(
      { data: null, error: "Rating not found" },
      { status: 404 },
    );
  }

  // Composite PK makes a repeated like a no-op rather than a conflict.
  const { error } = await ctx.serviceClient
    .from("rating_likes")
    .upsert(
      { rating_id: ratingId, user_id: ctx.actingUser.id },
      { onConflict: "rating_id,user_id" },
    );

  if (error) {
    console.error("[social/likes] insert error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to like rating" },
      { status: 500 },
    );
  }

  return countsResponse(ctx.serviceClient, ratingId, ctx.actingUser.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ratingId: string }> },
) {
  const { ratingId } = await params;
  const ctx = await resolveContext(ratingId);
  if ("error" in ctx) return ctx.error;

  // Idempotent: removing a like that isn't there is not an error.
  const { error } = await ctx.serviceClient
    .from("rating_likes")
    .delete()
    .eq("rating_id", ratingId)
    .eq("user_id", ctx.actingUser.id);

  if (error) {
    console.error("[social/likes] delete error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to remove like" },
      { status: 500 },
    );
  }

  return countsResponse(ctx.serviceClient, ratingId, ctx.actingUser.id);
}
