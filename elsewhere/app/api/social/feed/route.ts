import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasDevBypassCookie, tryGetOrCreateDevAuthUser } from "@/lib/devAuth";
import { computeMatchScoresByPlaceId } from "@/lib/matchScore";

// Tune these constants to adjust feed density without a code change.
const SOCIAL_FEED_WINDOW_DAYS = 7; // fallback recency window for null / stale last_feed_view_at
const SOCIAL_FEED_MAX_INITIAL = 15; // max cards in the initial "caught up" batch
const SOCIAL_FEED_PAGE_SIZE = 20; // cards per "view older" page

export async function GET(request: NextRequest) {
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
      ? await tryGetOrCreateDevAuthUser(serviceClient, "social/feed")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // ?before=<ISO> → pagination cursor for "view older"; absent → initial load
  const beforeParam = request.nextUrl.searchParams.get("before");
  const isOlderPage = beforeParam !== null;

  // Read follows and current user's last_feed_view_at in parallel
  const [
    { data: follows, error: followsError },
    { data: currentProfile },
  ] = await Promise.all([
    serviceClient
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", actingUser.id),
    serviceClient
      .from("profiles")
      .select("last_feed_view_at")
      .eq("id", actingUser.id)
      .maybeSingle(),
  ]);

  if (followsError) {
    console.error("[social/feed] follows error:", followsError);
    return NextResponse.json(
      { error: followsError.message ?? "Failed to load follows" },
      { status: 500 },
    );
  }

  const followingIds = (follows ?? []).map((f) => f.following_id as string);

  if (followingIds.length === 0) {
    return NextResponse.json({
      data: [],
      has_older: false,
      oldest_created_at: null,
      error: null,
    });
  }

  // Fetch ratings based on mode
  let ratingRowsResult;

  if (isOlderPage) {
    ratingRowsResult = await serviceClient
      .from("ratings")
      .select(
        "id, overall_rating, noise, vibe, outlets, tables, notes, photo_paths, created_at, place_id, user_id",
      )
      .in("user_id", followingIds)
      .eq("is_hidden", false)
      .lt("created_at", beforeParam)
      .order("created_at", { ascending: false })
      .limit(SOCIAL_FEED_PAGE_SIZE + 1);
  } else {
    // Compute recency cutoff: use last_feed_view_at if it's more recent than the window start
    const lastFeedViewAt = currentProfile?.last_feed_view_at as string | null;
    const windowStart = new Date(
      Date.now() - SOCIAL_FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const cutoff =
      lastFeedViewAt && new Date(lastFeedViewAt) > windowStart
        ? new Date(lastFeedViewAt)
        : windowStart;

    ratingRowsResult = await serviceClient
      .from("ratings")
      .select(
        "id, overall_rating, noise, vibe, outlets, tables, notes, photo_paths, created_at, place_id, user_id",
      )
      .in("user_id", followingIds)
      .eq("is_hidden", false)
      .gt("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false })
      .limit(SOCIAL_FEED_MAX_INITIAL + 1);
  }

  const { data: ratingRows, error: ratingsError } = ratingRowsResult;

  if (ratingsError) {
    console.error("[social/feed] ratings error:", ratingsError);
    return NextResponse.json(
      { error: ratingsError.message ?? "Failed to load ratings" },
      { status: 500 },
    );
  }

  // Detect whether the limit cap was hit (fetch one extra to check)
  const limit = isOlderPage ? SOCIAL_FEED_PAGE_SIZE : SOCIAL_FEED_MAX_INITIAL;
  const hasOlderFromCap = (ratingRows ?? []).length > limit;
  const paginatedRows = hasOlderFromCap
    ? ratingRows!.slice(0, limit)
    : (ratingRows ?? []);

  if (paginatedRows.length === 0) {
    return NextResponse.json({
      data: [],
      has_older: false,
      oldest_created_at: null,
      error: null,
    });
  }

  const oldestRow = paginatedRows.at(-1);
  const oldestCreatedAt = (oldestRow?.created_at as string | undefined) ?? null;

  // For the initial load only: if the cap wasn't hit, check whether items exist
  // older than the current batch (i.e., beyond the recency window).
  let hasOlder = hasOlderFromCap;
  if (!isOlderPage && !hasOlderFromCap && oldestRow) {
    const { count, error: countError } = await serviceClient
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .in("user_id", followingIds)
      .eq("is_hidden", false)
      .lt("created_at", oldestRow.created_at as string);
    if (!countError) {
      hasOlder = (count ?? 0) > 0;
    }
  }

  const placeIds = [...new Set(paginatedRows.map((r) => r.place_id as string))];
  const raterIds = [...new Set(paginatedRows.map((r) => r.user_id as string))];

  const [
    { data: placeRows, error: placesError },
    { data: profileRows, error: profilesError },
    { data: statsRows, error: statsError },
    { data: savedRows, error: savedError },
  ] = await Promise.all([
    serviceClient
      .from("places")
      .select("id, name, place_type, google_photo_ref")
      .in("id", placeIds),
    serviceClient
      .from("profiles")
      .select("id, full_name, avatar_url, username")
      .in("id", raterIds),
    serviceClient
      .from("place_stats")
      .select(
        "place_id, rating_count, avg_overall_rating, noise_silent, noise_quiet, noise_vibrant, vibe_focused, vibe_casual, vibe_social, tables_limited, tables_mixed, tables_plentiful, outlets_scarce, outlets_some, outlets_ample",
      )
      .in("place_id", placeIds),
    serviceClient
      .from("saved")
      .select("place_id")
      .eq("user_id", actingUser.id)
      .in("place_id", placeIds),
  ]);

  if (placesError) {
    console.error("[social/feed] places error:", placesError);
    return NextResponse.json(
      { error: placesError.message ?? "Failed to load places" },
      { status: 500 },
    );
  }

  if (profilesError) {
    console.error("[social/feed] profiles error:", profilesError);
    return NextResponse.json(
      { error: profilesError.message ?? "Failed to load profiles" },
      { status: 500 },
    );
  }

  if (statsError) {
    console.error("[social/feed] stats error:", statsError);
    return NextResponse.json(
      { error: statsError.message ?? "Failed to load place stats" },
      { status: 500 },
    );
  }

  if (savedError) {
    console.error("[social/feed] saved error:", savedError);
    return NextResponse.json(
      { error: savedError.message ?? "Failed to load saved places" },
      { status: 500 },
    );
  }

  const placeStatsList = (statsRows ?? []).map((s) => ({
    id: s.place_id as string,
    rating_count: (s.rating_count as number | bigint) ?? 0,
    avg_overall_rating: (s.avg_overall_rating as number | string | null) ?? null,
    noise_silent: (s.noise_silent as number | bigint) ?? 0,
    noise_quiet: (s.noise_quiet as number | bigint) ?? 0,
    noise_vibrant: (s.noise_vibrant as number | bigint) ?? 0,
    vibe_focused: (s.vibe_focused as number | bigint) ?? 0,
    vibe_casual: (s.vibe_casual as number | bigint) ?? 0,
    vibe_social: (s.vibe_social as number | bigint) ?? 0,
    tables_limited: (s.tables_limited as number | bigint) ?? 0,
    tables_mixed: (s.tables_mixed as number | bigint) ?? 0,
    tables_plentiful: (s.tables_plentiful as number | bigint) ?? 0,
    outlets_scarce: (s.outlets_scarce as number | bigint) ?? 0,
    outlets_some: (s.outlets_some as number | bigint) ?? 0,
    outlets_ample: (s.outlets_ample as number | bigint) ?? 0,
  }));

  const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
    serviceRoleClient: serviceClient,
    userId: actingUser.id,
    places: placeStatsList,
  });

  const savedPlaceIds = new Set(
    (savedRows ?? []).map((s) => s.place_id as string),
  );

  const placeById = new Map(
    (placeRows ?? []).map((p) => [p.id as string, p]),
  );
  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p]),
  );

  const data = paginatedRows.map((r) => {
    const placeId = r.place_id as string;
    const place = placeById.get(placeId);
    const profile = profileById.get(r.user_id as string);
    const matchScore = resultsByPlaceId[placeId] ?? null;
    return {
      id: r.id as string,
      overall_rating:
        r.overall_rating != null ? Number(r.overall_rating) : null,
      noise: (r.noise as string | null) ?? null,
      vibe: (r.vibe as string | null) ?? null,
      outlets: (r.outlets as string | null) ?? null,
      tables: (r.tables as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      photo_paths: Array.isArray(r.photo_paths)
        ? (r.photo_paths as string[])
        : [],
      created_at: r.created_at as string,
      place_id: placeId,
      place_name: (place?.name as string | null) ?? "Unknown place",
      place_type: (place?.place_type as string | null) ?? "",
      google_photo_ref: (place?.google_photo_ref as string | null) ?? null,
      rater_id: r.user_id as string,
      rater_name: (profile?.full_name as string | null) ?? null,
      rater_username: (profile?.username as string | null) ?? null,
      rater_avatar: (profile?.avatar_url as string | null) ?? null,
      match_score_percent: matchScore?.matchScorePercent ?? null,
      is_saved: savedPlaceIds.has(placeId),
    };
  });

  return NextResponse.json({
    data,
    has_older: hasOlder,
    oldest_created_at: oldestCreatedAt,
    error: null,
  });
}
