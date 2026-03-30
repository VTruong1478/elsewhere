import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveOpeningState, hasOpenLate } from "@/lib/opening-hours";
import type { FeedItem } from "@/types/feed";
import { computeMatchScoresByPlaceId } from "@/lib/matchScore";

export type PlaceStatsRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  opening_hours: Record<string, unknown> | null;
  timezone: string | null;
  google_photo_ref: string | null;
  vibe_photo_ref: string | null;
  vibe_photo_attribution: unknown;
  cost: string | null;
  rating_count: number | bigint;
  avg_overall_rating: number | string | null;
  noise_silent: number | bigint;
  noise_quiet: number | bigint;
  noise_vibrant: number | bigint;
  tables_limited: number | bigint;
  tables_mixed: number | bigint;
  tables_plentiful: number | bigint;
  outlets_scarce: number | bigint;
  outlets_some: number | bigint;
  outlets_ample: number | bigint;
  vibe_focused: number | bigint;
  vibe_casual: number | bigint;
  vibe_social: number | bigint;
};

export function getTop2Pills(pillsArrays: string[][]): string[] {
  const count: Record<string, number> = {};
  for (const arr of pillsArrays) {
    for (const p of arr) {
      count[p] = (count[p] ?? 0) + 1;
    }
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
}

function distanceMeters(
  row: { lat: number; lng: number },
  refLat: number,
  refLng: number,
): number {
  const R = 6371000;
  const dLat = ((row.lat - refLat) * Math.PI) / 180;
  const dLng = ((row.lng - refLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((refLat * Math.PI) / 180) *
      Math.cos((row.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type BuildFeedItemsOptions = {
  supabase: SupabaseClient;
  serviceRoleClient: SupabaseClient;
  /** Defaults to supabase; use service role for server routes if session/RLS is unreliable. */
  ratingsClient?: SupabaseClient;
  userId: string | null;
  placeList: PlaceStatsRow[];
  refLat: number;
  refLng: number;
  filterChip: string;
  favoritedPlaceIds: Set<string>;
  /** If set, output order follows these ids (extras dropped). */
  idOrder?: string[];
  /** Max items (e.g. feed home). Omit for no limit. */
  limit?: number;
};

/**
 * Shared pipeline: pills, match scores, opening hours, favorites → FeedItem[].
 * Used by /api/feed and /api/saved.
 */
export async function buildFeedItemsFromPlaces(
  opts: BuildFeedItemsOptions,
): Promise<FeedItem[]> {
  const {
    supabase,
    serviceRoleClient,
    ratingsClient: ratingsDbOpt,
    userId,
    placeList,
    refLat,
    refLng,
    filterChip,
    favoritedPlaceIds,
    idOrder,
    limit,
  } = opts;
  const ratingsDb = ratingsDbOpt ?? supabase;

  const placeIds = placeList.map((r) => r.id);
  let userRatedPlaceIds: Set<string> = new Set();
  if (userId && placeIds.length > 0) {
    const { data: myRatings } = await ratingsDb
      .from("ratings")
      .select("place_id")
      .eq("user_id", userId)
      .in("place_id", placeIds);
    if (myRatings) {
      userRatedPlaceIds = new Set(
        myRatings
          .map((row) => row.place_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
    }
  }

  let vibePhotoPathByPlaceId: Record<string, string | null> = {};
  if (placeIds.length > 0) {
    const { data: placeRows } = await serviceRoleClient
      .from("places")
      .select("id, vibe_photo_path")
      .in("id", placeIds);

    if (placeRows) {
      vibePhotoPathByPlaceId = Object.fromEntries(
        placeRows.map((r) => [
          r.id as string,
          (r.vibe_photo_path as string | null) ?? null,
        ]),
      );
    }
  }

  const pillsByPlace: Record<string, string[]> = {};
  if (placeIds.length > 0) {
    const { data: ratings } = await ratingsDb
      .from("ratings")
      .select("place_id, pills, updated_at")
      .in("place_id", placeIds)
      .order("updated_at", { ascending: false });

    const byPlace: Record<string, { pills: string[] }[]> = {};
    for (const row of ratings ?? []) {
      const id = row.place_id;
      if (!byPlace[id]) byPlace[id] = [];
      if (
        byPlace[id].length < 20 &&
        Array.isArray(row.pills) &&
        row.pills.length > 0
      ) {
        byPlace[id].push({ pills: row.pills });
      }
    }
    for (const [placeId, arr] of Object.entries(byPlace)) {
      pillsByPlace[placeId] = getTop2Pills(arr.map((a) => a.pills));
    }
  }

  const { userHasRatings, resultsByPlaceId } = await computeMatchScoresByPlaceId(
    {
      serviceRoleClient,
      userId: userId ?? null,
      places: placeList as PlaceStatsRow[],
    },
  );

  const items: (FeedItem & {
    _distanceMeters: number;
    _matchScorePercent: number | null;
    _ratingCount: number;
  })[] = placeList.map((row: PlaceStatsRow) => {
    const dist = distanceMeters(row, refLat, refLng);

    const opening = deriveOpeningState(
      row.opening_hours as Parameters<typeof deriveOpeningState>[0],
      row.timezone,
    );
    const openLate =
      filterChip === "open_late"
        ? true
        : hasOpenLate(
            row.opening_hours as Parameters<typeof hasOpenLate>[0],
            row.timezone,
          );

    const ratingCount = Number(row.rating_count ?? 0);
    const raw = row as Record<string, unknown>;
    const match = resultsByPlaceId[row.id];

    const dominant_noise = match?.dominant_noise ?? null;
    const dominant_vibe = match?.dominant_vibe ?? null;
    const dominant_tables = match?.dominant_tables ?? null;
    const dominant_outlets = match?.dominant_outlets ?? null;
    const match_score_percent = match?.match_score_percent ?? null;

    const googlePhotoRef =
      (row.google_photo_ref as string | null | undefined) ??
      (raw.google_photo_ref as string | null | undefined) ??
      (raw.googlePhotoRef as string | null | undefined) ??
      null;
    const vibePhotoRef =
      (row.vibe_photo_ref as string | null | undefined) ??
      (raw.vibe_photo_ref as string | null | undefined) ??
      null;
    const vibePhotoAttribution =
      (row.vibe_photo_attribution as unknown) ??
      (raw.vibe_photo_attribution as unknown) ??
      null;

    return {
      id: row.id,
      name: row.name,
      address: row.address,
      lat: Number(row.lat),
      lng: Number(row.lng),
      place_type: row.place_type,
      noise: dominant_noise,
      dominant_noise,
      vibe: dominant_vibe,
      dominant_vibe,
      tables: dominant_tables,
      dominant_tables,
      outlets: dominant_outlets,
      dominant_outlets,
      match_score_percent,
      why_matched: [],
      open_now: opening.open_now,
      closes_at: opening.closes_at,
      closing_soon: opening.closing_soon,
      open_late: openLate,
      pills: pillsByPlace[row.id] ?? [],
      is_favorited: favoritedPlaceIds.has(row.id),
      user_has_rated: userRatedPlaceIds.has(row.id),
      distance_mi: dist / 1609.344,
      rating_count: ratingCount,
      image_url: null,
      google_photo_ref:
        googlePhotoRef && String(googlePhotoRef).trim() ? googlePhotoRef : null,
      vibe_photo_ref:
        vibePhotoRef && String(vibePhotoRef).trim() ? vibePhotoRef : null,
      vibe_photo_path:
        vibePhotoPathByPlaceId[row.id] &&
        String(vibePhotoPathByPlaceId[row.id]).trim()
          ? (vibePhotoPathByPlaceId[row.id] as string)
          : null,
      vibe_photo_attribution: vibePhotoAttribution,
      cost: row.cost ?? null,
      _distanceMeters: dist,
      _matchScorePercent: match_score_percent,
      _ratingCount: ratingCount,
    };
  });

  if (userHasRatings) {
    items.sort((a, b) => {
      const scoreA = a._matchScorePercent ?? -1;
      const scoreB = b._matchScorePercent ?? -1;
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a._distanceMeters !== b._distanceMeters)
        return a._distanceMeters - b._distanceMeters;
      return b._ratingCount - a._ratingCount;
    });
  } else {
    items.sort((a, b) => a._distanceMeters - b._distanceMeters);
  }

  let result = items.map(
    ({ _distanceMeters, _matchScorePercent, _ratingCount, ...item }) => {
      void _distanceMeters;
      void _matchScorePercent;
      void _ratingCount;
      return item as FeedItem;
    },
  );

  if (filterChip === "quiet") {
    result = result.filter(
      (item) => item.dominant_noise === "Silent" || item.dominant_noise === "Quiet",
    );
  }

  if (filterChip === "open_now") {
    result = result.filter((item) => item.open_now);
  }

  if (filterChip === "bookstores") {
    result = result.filter(
      (item) => item.place_type?.toLowerCase() === "bookstore",
    );
  }

  if (idOrder?.length) {
    const byId = new Map(result.map((i) => [i.id, i]));
    const ordered: FeedItem[] = [];
    for (const id of idOrder) {
      const item = byId.get(id);
      if (item) ordered.push(item);
    }
    result = ordered;
  }

  if (typeof limit === "number" && limit >= 0) {
    result = result.slice(0, limit);
  }

  return result;
}
