import type { NoiseLabel, OutletsLabel, TablesLabel, VibeLabel } from "@/types/feed";
import type { SupabaseClient } from "@supabase/supabase-js";

type PlaceStatsRowLike = {
  id: string;
  rating_count: number | bigint;
  avg_overall_rating: number | string | null;
  noise_silent: number | bigint;
  noise_quiet: number | bigint;
  noise_vibrant: number | bigint;
  vibe_focused: number | bigint;
  vibe_casual: number | bigint;
  vibe_social: number | bigint;
  tables_limited: number | bigint;
  tables_mixed: number | bigint;
  tables_plentiful: number | bigint;
  outlets_scarce: number | bigint;
  outlets_some: number | bigint;
  outlets_ample: number | bigint;
};

export type MatchScoresByPlaceId = Record<
  string,
  {
    match_score_percent: number | null;
    dominant_noise: NoiseLabel | null;
    dominant_vibe: VibeLabel | null;
    dominant_tables: TablesLabel | null;
    dominant_outlets: OutletsLabel | null;
  }
>;

function toNumber(v: number | string | bigint | null | undefined): number {
  if (v == null) return NaN;
  if (typeof v === "bigint") return Number(v);
  return typeof v === "number" ? v : Number(v);
}

function dominantNoiseFromCounts(row: PlaceStatsRowLike): NoiseLabel | null {
  const silent = toNumber(row.noise_silent);
  const quiet = toNumber(row.noise_quiet);
  const vibrant = toNumber(row.noise_vibrant);
  const max = Math.max(silent, quiet, vibrant);
  if (max === 0) return null;

  // tie -> quiet (middle)
  const ties = [silent === max, quiet === max, vibrant === max].filter(Boolean)
    .length;
  if (ties > 1) return "Quiet";
  if (quiet === max) return "Quiet";
  if (vibrant === max) return "Vibrant";
  return "Silent";
}

function dominantVibeFromCounts(row: PlaceStatsRowLike): VibeLabel | null {
  const focused = toNumber(row.vibe_focused);
  const casual = toNumber(row.vibe_casual);
  const social = toNumber(row.vibe_social);
  const max = Math.max(focused, casual, social);
  if (max === 0) return null;

  // tie -> casual (middle)
  const ties = [focused === max, casual === max, social === max].filter(Boolean)
    .length;
  if (ties > 1) return "Casual";
  if (casual === max) return "Casual";
  if (focused === max) return "Focused";
  return "Social";
}

function dominantTablesFromCounts(row: PlaceStatsRowLike): TablesLabel | null {
  const limited = toNumber(row.tables_limited);
  const mixed = toNumber(row.tables_mixed);
  const plentiful = toNumber(row.tables_plentiful);
  const max = Math.max(limited, mixed, plentiful);
  if (max === 0) return null;

  // tie -> mixed (middle)
  const ties = [limited === max, mixed === max, plentiful === max].filter(
    Boolean,
  ).length;
  if (ties > 1) return "mixed";
  if (mixed === max) return "mixed";
  if (limited === max) return "limited";
  return "plentiful";
}

function dominantOutletsFromCounts(
  row: PlaceStatsRowLike,
): OutletsLabel | null {
  const scarce = toNumber(row.outlets_scarce);
  const some = toNumber(row.outlets_some);
  const ample = toNumber(row.outlets_ample);
  const max = Math.max(scarce, some, ample);
  if (max === 0) return null;

  // tie -> some (middle)
  const ties = [scarce === max, some === max, ample === max].filter(Boolean)
    .length;
  if (ties > 1) return "some";
  if (some === max) return "some";
  if (scarce === max) return "scarce";
  return "ample";
}

function noiseEnumToLabel(v: unknown): NoiseLabel | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (s === "silent") return "Silent";
  if (s === "quiet") return "Quiet";
  if (s === "vibrant") return "Vibrant";
  return null;
}

function vibeEnumToLabel(v: unknown): VibeLabel | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (s === "focused") return "Focused";
  if (s === "casual") return "Casual";
  if (s === "social") return "Social";
  return null;
}

export async function computeMatchScoresByPlaceId(params: {
  serviceRoleClient: SupabaseClient;
  userId: string | null;
  places: PlaceStatsRowLike[];
}): Promise<{ userHasRatings: boolean; resultsByPlaceId: MatchScoresByPlaceId }> {
  const { serviceRoleClient, userId, places } = params;

  // -----------------------------
  // Step 1 — Derive implied preferences from rating history
  // -----------------------------
  const noiseOrder: NoiseLabel[] = ["Silent", "Quiet", "Vibrant"];
  const vibeOrder: VibeLabel[] = ["Focused", "Casual", "Social"];

  let userHasRatings = false;
  let impliedNoise: NoiseLabel | null = null;
  let impliedVibe: VibeLabel | null = null;

  if (userId) {
    type UserRatingRow = {
      noise: string;
      vibe: string;
      overall_rating: number | string | null;
    };

    const { data: ratingRows } = await serviceRoleClient
      .from("ratings")
      .select("noise, vibe, overall_rating")
      .eq("user_id", userId);

    const rows: UserRatingRow[] = Array.isArray(ratingRows)
      ? (ratingRows as UserRatingRow[])
      : [];
    userHasRatings = rows.length > 0;

    if (userHasRatings) {
      const noiseTotal: Record<NoiseLabel, number> = {
        Silent: 0,
        Quiet: 0,
        Vibrant: 0,
      };
      const vibeTotal: Record<VibeLabel, number> = {
        Focused: 0,
        Casual: 0,
        Social: 0,
      };

      for (const r of rows) {
        const noise = noiseEnumToLabel(r.noise);
        const vibe = vibeEnumToLabel(r.vibe);
        const weight = toNumber(r.overall_rating);

        if (Number.isNaN(weight)) continue;
        if (noise) noiseTotal[noise] += weight;
        if (vibe) vibeTotal[vibe] += weight;
      }

      const noiseMax = Math.max(...noiseOrder.map((l) => noiseTotal[l]));
      const noiseTied = noiseOrder.filter((l) => noiseTotal[l] === noiseMax);
      impliedNoise = noiseTied.length > 1 ? "Quiet" : noiseTied[0] ?? null;

      const vibeMax = Math.max(...vibeOrder.map((l) => vibeTotal[l]));
      const vibeTied = vibeOrder.filter((l) => vibeTotal[l] === vibeMax);
      impliedVibe = vibeTied.length > 1 ? "Casual" : vibeTied[0] ?? null;
    }
  }

  // -----------------------------
  // Step 2 + Step 3 — Score each place (and compute dominant labels)
  // -----------------------------
  const resultsByPlaceId: MatchScoresByPlaceId = {};

  for (const place of places) {
    const ratingCount = toNumber(place.rating_count) || 0;

    const dominant_noise =
      ratingCount < 1 ? null : dominantNoiseFromCounts(place);
    const dominant_vibe =
      ratingCount < 1 ? null : dominantVibeFromCounts(place);
    const dominant_tables =
      ratingCount < 1 ? null : dominantTablesFromCounts(place);
    const dominant_outlets =
      ratingCount < 1 ? null : dominantOutletsFromCounts(place);

    let match_score_percent: number | null = null;

    const avg = toNumber(place.avg_overall_rating);
    if (ratingCount >= 1 && !Number.isNaN(avg)) {
      if (userHasRatings && impliedNoise && impliedVibe && dominant_noise && dominant_vibe) {
        const noiseDiff = Math.abs(
          noiseOrder.indexOf(dominant_noise as NoiseLabel) -
            noiseOrder.indexOf(impliedNoise),
        );
        const vibeDiff = Math.abs(
          vibeOrder.indexOf(dominant_vibe as VibeLabel) - vibeOrder.indexOf(impliedVibe),
        );

        const noise_match = noiseDiff === 0 ? 1 : noiseDiff === 1 ? 0.5 : 0;
        const vibe_match = vibeDiff === 0 ? 1 : vibeDiff === 1 ? 0.5 : 0;

        const base_score = (noise_match + vibe_match) / 2;
        const place_quality = avg / 5.0;
        const match_score = base_score * 0.7 + place_quality * 0.3;
        match_score_percent = Math.round(match_score * 100);
      } else {
        // Cold start fallback (no personal history): use community quality only.
        match_score_percent = Math.round(Math.min(100, Math.max(0, (avg / 5) * 100)));
      }
    }

    resultsByPlaceId[place.id] = {
      match_score_percent,
      dominant_noise,
      dominant_vibe,
      dominant_tables,
      dominant_outlets,
    };
  }

  return { userHasRatings, resultsByPlaceId };
}

