import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type RatingSocialCounts = {
  rating_id: string;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
};

/**
 * Batch like/comment counts for a set of ratings.
 *
 * Returns an empty map on failure rather than throwing: counts are decoration,
 * and a missing RPC (e.g. migration not yet applied) must not blank the feed.
 */
export async function fetchRatingSocialCounts(
  client: SupabaseClient,
  ratingIds: string[],
  viewerId: string | null,
): Promise<Map<string, RatingSocialCounts>> {
  const map = new Map<string, RatingSocialCounts>();
  if (ratingIds.length === 0) return map;

  const { data, error } = await client.rpc("get_rating_social_counts", {
    p_rating_ids: ratingIds,
    p_viewer_id: viewerId,
  });

  if (error) {
    console.error("[ratingSocial] counts unavailable:", error.message);
    return map;
  }

  for (const row of (data ?? []) as RatingSocialCounts[]) {
    map.set(row.rating_id, row);
  }
  return map;
}

/** Confirms a rating exists and is visible before attaching a like or comment. */
export async function ratingIsVisible(
  serviceClient: SupabaseClient,
  ratingId: string,
): Promise<{ exists: boolean; ownerId: string | null }> {
  const { data, error } = await serviceClient
    .from("ratings")
    .select("id, user_id, is_hidden")
    .eq("id", ratingId)
    .maybeSingle();

  if (error || !data || data.is_hidden) {
    return { exists: false, ownerId: null };
  }
  return { exists: true, ownerId: data.user_id as string };
}
