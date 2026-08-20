import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import { isUuid, ratingIsVisible } from "@/lib/ratingSocial";

/** The comment's author, or the owner of the rating it sits under, may delete. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ratingId: string; commentId: string }> },
) {
  const { ratingId, commentId } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (hasDevBypassCookie(cookieStore)
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/comments")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { data: null, error: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isUuid(ratingId) || !isUuid(commentId)) {
    return NextResponse.json(
      { data: null, error: "Invalid id" },
      { status: 400 },
    );
  }

  const { data: comment, error: loadError } = await serviceClient
    .from("rating_comments")
    .select("id, rating_id, user_id")
    .eq("id", commentId)
    .maybeSingle();

  // Mismatched rating segment is treated as not-found to avoid id confusion.
  if (loadError || !comment || comment.rating_id !== ratingId) {
    return NextResponse.json(
      { data: null, error: "Comment not found" },
      { status: 404 },
    );
  }

  const { ownerId } = await ratingIsVisible(serviceClient, ratingId);
  const allowed =
    actingUser.id === comment.user_id || actingUser.id === ownerId;

  if (!allowed) {
    return NextResponse.json(
      { data: null, error: "Not allowed to delete this comment" },
      { status: 403 },
    );
  }

  const { error } = await serviceClient
    .from("rating_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("[social/comments] delete error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to delete comment" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: null, error: null });
}
