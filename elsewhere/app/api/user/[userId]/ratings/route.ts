import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import { computeMatchScoresByPlaceId } from "@/lib/matchScore";
import type { PlaceStatsRow } from "@/lib/feedItemsFromPlaces";
import type { RatingCardItem } from "@/components/social/RatingCard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  // Viewer auth is optional (ratings are publicly readable per RLS)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewer =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "user/ratings")
      : null);

  // Fetch ratings with place join
  const { data: ratingRows, error: ratingsError } = await serviceClient
    .from("ratings")
    .select(
      "id, notes, photo_paths, created_at, place_id, places!inner(name, place_type)",
    )
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (ratingsError) {
    console.error("[user/ratings] ratings error:", ratingsError);
    return NextResponse.json(
      { data: null, error: ratingsError.message ?? "Failed to load ratings" },
      { status: 500 },
    );
  }

  if (!ratingRows?.length) {
    return NextResponse.json({ data: [], error: null });
  }

  type RatingRow = {
    id: string;
    notes: string | null;
    photo_paths: string[] | null;
    created_at: string;
    place_id: string;
    places: { name: string; place_type: string } | { name: string; place_type: string }[];
  };

  const rows = ratingRows as unknown as RatingRow[];

  // Collect unique place IDs for stats + match scores
  const placeIds = [...new Set(rows.map((r) => r.place_id).filter(Boolean))];

  // Fetch place stats for match score computation
  const { data: statRows } = await serviceClient
    .from("place_stats")
    .select("*")
    .in("place_id", placeIds);

  const statsById = new Map(
    (statRows ?? []).map((s) => [String(s.place_id), s]),
  );

  // Also fetch place lat/lng (needed for PlaceStatsRow shape, even though we won't use it for distance here)
  const { data: placeRows } = await serviceClient
    .from("places")
    .select("id, lat, lng, name, place_type")
    .in("id", placeIds);

  const placeById = new Map(
    (placeRows ?? []).map((p) => [String(p.id), p]),
  );

  const emptyStats = (placeId: string): Record<string, number | bigint | null | string> => ({
    place_id: placeId,
    rating_count: 0,
    avg_overall_rating: null,
    noise_silent: 0,
    noise_quiet: 0,
    noise_vibrant: 0,
    tables_limited: 0,
    tables_mixed: 0,
    tables_plentiful: 0,
    outlets_scarce: 0,
    outlets_some: 0,
    outlets_ample: 0,
    vibe_focused: 0,
    vibe_casual: 0,
    vibe_social: 0,
  });

  const placeStatsList: PlaceStatsRow[] = placeIds
    .flatMap((pid) => {
      const p = placeById.get(pid);
      if (!p) return [];
      const statsRaw = statsById.get(pid) ?? emptyStats(pid);
      const stats = statsRaw as Record<string, unknown>;
      const row: PlaceStatsRow = {
        id: pid,
        name: p.name as string,
        address: "",
        lat: Number(p.lat),
        lng: Number(p.lng),
        place_type: p.place_type as string,
        opening_hours: null,
        timezone: null,
        google_photo_ref: null,
        vibe_photo_ref: null,
        vibe_photo_attribution: null,
        cost: null,
        rating_count: (stats.rating_count as number | bigint) ?? 0,
        avg_overall_rating: (stats.avg_overall_rating as number | string | null) ?? null,
        noise_silent: (stats.noise_silent as number | bigint) ?? 0,
        noise_quiet: (stats.noise_quiet as number | bigint) ?? 0,
        noise_vibrant: (stats.noise_vibrant as number | bigint) ?? 0,
        tables_limited: (stats.tables_limited as number | bigint) ?? 0,
        tables_mixed: (stats.tables_mixed as number | bigint) ?? 0,
        tables_plentiful: (stats.tables_plentiful as number | bigint) ?? 0,
        outlets_scarce: (stats.outlets_scarce as number | bigint) ?? 0,
        outlets_some: (stats.outlets_some as number | bigint) ?? 0,
        outlets_ample: (stats.outlets_ample as number | bigint) ?? 0,
        vibe_focused: (stats.vibe_focused as number | bigint) ?? 0,
        vibe_casual: (stats.vibe_casual as number | bigint) ?? 0,
        vibe_social: (stats.vibe_social as number | bigint) ?? 0,
      };
      return [row];
    });

  // Compute match scores for the viewer
  const { resultsByPlaceId } = await computeMatchScoresByPlaceId({
    serviceRoleClient: serviceClient,
    userId: viewer?.id ?? null,
    places: placeStatsList,
  });

  // Fetch viewer's saved places for is_saved flag
  let savedPlaceIds = new Set<string>();
  if (viewer) {
    const { data: savedRows } = await serviceClient
      .from("saved")
      .select("place_id")
      .eq("user_id", viewer.id)
      .in("place_id", placeIds);
    savedPlaceIds = new Set((savedRows ?? []).map((s) => String(s.place_id)));
  }

  const data: RatingCardItem[] = rows.map((row) => {
    const placeInfo = Array.isArray(row.places) ? row.places[0] : row.places;
    const match = resultsByPlaceId[row.place_id];
    return {
      id: row.id,
      notes: row.notes ?? null,
      photo_paths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
      created_at: row.created_at,
      place_id: row.place_id,
      place_name: placeInfo?.name ?? "",
      match_score_percent: match?.matchScorePercent ?? null,
      is_saved: savedPlaceIds.has(row.place_id),
      rater_id: userId,
      rater_name: null,
      rater_username: null,
      rater_avatar: null,
    };
  });

  return NextResponse.json({ data, error: null });
}
