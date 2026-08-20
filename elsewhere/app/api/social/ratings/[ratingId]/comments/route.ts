import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import { isUuid, ratingIsVisible } from "@/lib/ratingSocial";
import {
  COMMENT_RATE_MAX,
  COMMENT_RATE_WINDOW_MS,
  MAX_COMMENT_LENGTH,
} from "@/lib/constants/comments";

const MAX_THREAD_COMMENTS = 200;

export type RatingCommentItem = {
  id: string;
  rating_id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar: string | null;
  can_delete: boolean;
};

/** GET is auth-optional: threads are readable on public profile pages. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ratingId: string }> },
) {
  const { ratingId } = await params;
  if (!isUuid(ratingId)) {
    return NextResponse.json(
      { data: null, error: "Invalid rating id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { exists, ownerId } = await ratingIsVisible(serviceClient, ratingId);
  if (!exists) {
    return NextResponse.json(
      { data: null, error: "Rating not found" },
      { status: 404 },
    );
  }

  const { data: rows, error } = await serviceClient
    .from("rating_comments")
    .select("id, rating_id, body, created_at, user_id")
    .eq("rating_id", ratingId)
    .order("created_at", { ascending: true })
    .limit(MAX_THREAD_COMMENTS);

  if (error) {
    console.error("[social/comments] select error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to load comments" },
      { status: 500 },
    );
  }

  if (!rows?.length) return NextResponse.json({ data: [], error: null });

  // Batched author lookup — one extra query rather than one per comment.
  const authorIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const { data: profiles } = await serviceClient
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", authorIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  const data: RatingCommentItem[] = rows.map((r) => {
    const author = profileById.get(r.user_id as string);
    return {
      id: r.id as string,
      rating_id: r.rating_id as string,
      body: r.body as string,
      created_at: r.created_at as string,
      author_id: r.user_id as string,
      author_name: (author?.full_name as string | null) ?? null,
      author_username: (author?.username as string | null) ?? null,
      author_avatar: (author?.avatar_url as string | null) ?? null,
      can_delete:
        !!user && (user.id === r.user_id || user.id === ownerId),
    };
  });

  return NextResponse.json({ data, error: null });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ratingId: string }> },
) {
  const { ratingId } = await params;
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

  if (!isUuid(ratingId)) {
    return NextResponse.json(
      { data: null, error: "Invalid rating id" },
      { status: 400 },
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    body?: unknown;
  } | null;

  if (!payload || typeof payload.body !== "string") {
    return NextResponse.json(
      { data: null, error: "Comment must be text" },
      { status: 400 },
    );
  }

  const body = payload.body.trim();
  if (body.length === 0) {
    return NextResponse.json(
      { data: null, error: "Comment cannot be empty" },
      { status: 400 },
    );
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      {
        data: null,
        error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
      },
      { status: 400 },
    );
  }

  const { exists } = await ratingIsVisible(serviceClient, ratingId);
  if (!exists) {
    return NextResponse.json(
      { data: null, error: "Rating not found" },
      { status: 404 },
    );
  }

  // Index-only count over the rate window; no rate-limit infrastructure exists.
  const since = new Date(Date.now() - COMMENT_RATE_WINDOW_MS).toISOString();
  const { count } = await serviceClient
    .from("rating_comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actingUser.id)
    .gt("created_at", since);

  if ((count ?? 0) >= COMMENT_RATE_MAX) {
    return NextResponse.json(
      { data: null, error: "Too many comments. Please slow down." },
      { status: 429 },
    );
  }

  const { data: inserted, error } = await serviceClient
    .from("rating_comments")
    .insert({ rating_id: ratingId, user_id: actingUser.id, body })
    .select("id, rating_id, body, created_at, user_id")
    .single();

  if (error || !inserted) {
    console.error("[social/comments] insert error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to post comment" },
      { status: 500 },
    );
  }

  const { data: author } = await serviceClient
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", actingUser.id)
    .maybeSingle();

  const data: RatingCommentItem = {
    id: inserted.id as string,
    rating_id: inserted.rating_id as string,
    body: inserted.body as string,
    created_at: inserted.created_at as string,
    author_id: actingUser.id,
    author_name: (author?.full_name as string | null) ?? null,
    author_username: (author?.username as string | null) ?? null,
    author_avatar: (author?.avatar_url as string | null) ?? null,
    can_delete: true,
  };

  return NextResponse.json({ data, error: null }, { status: 201 });
}
