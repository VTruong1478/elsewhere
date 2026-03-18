import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deriveOpeningState, hasOpenLate } from "@/lib/opening-hours";
import type { FeedItem } from "@/types/feed";
import type { NoiseLabel, TablesLabel, OutletsLabel } from "@/types/feed";

type PlaceStatsRow = {
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
  noise_silent: number | bigint;
  noise_quiet: number | bigint;
  noise_vibrant: number | bigint;
  tables_limited: number | bigint;
  tables_mixed: number | bigint;
  tables_ideal: number | bigint;
  tables_none: number | bigint;
  outlets_none: number | bigint;
  outlets_limited: number | bigint;
  outlets_ample: number | bigint;
  vibe_focused: number | bigint;
  vibe_casual: number | bigint;
  vibe_social: number | bigint;
  place_noise_level: string | null;
  place_tables_level: string | null;
  place_outlets_level: string | null;
};

function placeNoiseToLabel(v: string | null): NoiseLabel | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "silent") return "Silent";
  if (s === "quiet") return "Quiet";
  if (s === "vibrant") return "Vibrant";
  return null;
}

function placeTablesToLabel(v: string | null): TablesLabel | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "limited") return "Limited";
  if (s === "mixed") return "Mixed";
  if (s === "ideal") return "Ideal";
  return null;
}

function placeOutletsToLabel(v: string | null): OutletsLabel | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "none") return "None";
  if (s === "limited") return "Limited";
  if (s === "ample") return "Ample";
  return null;
}

function n(v: number | bigint): number {
  return typeof v === "bigint" ? Number(v) : v;
}

function dominantNoise(row: PlaceStatsRow): NoiseLabel | null {
  const max = Math.max(
    n(row.noise_silent),
    n(row.noise_quiet),
    n(row.noise_vibrant),
  );
  if (max === 0) return null;
  if (n(row.noise_quiet) === max) return "Quiet";
  if (n(row.noise_vibrant) === max) return "Vibrant";
  return "Silent";
}

function dominantTables(row: PlaceStatsRow): TablesLabel | null {
  const max = Math.max(
    n(row.tables_limited),
    n(row.tables_mixed),
    n(row.tables_ideal),
  );
  if (max === 0) return null;
  if (n(row.tables_ideal) === max) return "Ideal";
  if (n(row.tables_mixed) === max) return "Mixed";
  return "Limited";
}

function dominantOutlets(row: PlaceStatsRow): OutletsLabel | null {
  const max = Math.max(
    n(row.outlets_none),
    n(row.outlets_limited),
    n(row.outlets_ample),
  );
  if (max === 0) return null;
  if (n(row.outlets_ample) === max) return "Ample";
  if (n(row.outlets_limited) === max) return "Limited";
  return "None";
}

function dominantVibe(row: PlaceStatsRow): "Focused" | "Casual" | "Social" | null {
  const focused = n(row.vibe_focused);
  const casual = n(row.vibe_casual);
  const social = n(row.vibe_social);
  const max = Math.max(focused, casual, social);
  if (max === 0) return null;

  const matches = [
    focused === max,
    casual === max,
    social === max,
  ].filter(Boolean).length;

  // If tied for highest, default to Casual.
  if (matches > 1) return "Casual";
  if (casual === max) return "Casual";
  if (focused === max) return "Focused";
  return "Social";
}

function computeMatchScore(
  row: PlaceStatsRow,
  distanceMeters: number,
  prefs: {
    radius_miles: number;
    noise_preference: string | null;
    needs_outlets: boolean;
    needs_wifi: boolean;
    hasPreferences: boolean;
  },
): { score: number; reasons: string[] } {
  if (!prefs.hasPreferences) {
    return { score: 50, reasons: [] };
  }
  const reasons: string[] = [];
  let score = 50;
  const radiusMeters = prefs.radius_miles * 1609.344;
  if (distanceMeters <= radiusMeters) {
    const distanceScore = Math.max(
      0,
      30 - (distanceMeters / radiusMeters) * 20,
    );
    score += distanceScore;
    if (distanceMeters < radiusMeters * 0.5) reasons.push("Close to you");
  }
  const noise = dominantNoise(row);
  if (
    noise &&
    prefs.noise_preference &&
    noise.toLowerCase() === prefs.noise_preference
  ) {
    score += 15;
    reasons.push(noise);
  }
  const outlets = dominantOutlets(row);
  if (prefs.needs_outlets && outlets === "Ample") {
    score += 10;
    reasons.push("Ample outlets");
  }
  const rc = n(row.rating_count);
  const dampener = rc < 2 ? 0.6 : rc < 4 ? 0.8 : 1;
  score = Math.round(Math.min(100, score * dampener));
  return { score, reasons: reasons.slice(0, 3) };
}

function getTop2Pills(pillsArrays: string[][]): string[] {
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

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[feed] Start of GET handler', Date.now() - startTime, 'ms');

  const { searchParams } = new URL(request.url);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  let lat = latParam != null ? parseFloat(latParam) : NaN;
  let lng = lngParam != null ? parseFloat(lngParam) : NaN;

  if (process.env.NODE_ENV === "development") {
    const devLat = process.env.DEV_LOCATION_LAT
      ? Number(process.env.DEV_LOCATION_LAT)
      : NaN;
    const devLng = process.env.DEV_LOCATION_LNG
      ? Number(process.env.DEV_LOCATION_LNG)
      : NaN;

    if (!Number.isNaN(devLat) && !Number.isNaN(devLng)) {
      lat = devLat;
      lng = devLng;
    }
  }

  console.log(
    '[feed] After reading dev location override',
    Date.now() - startTime,
    'ms',
  );

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { data: null, error: "lat and lng are required" },
      { status: 400 },
    );
  }

  const q = (searchParams.get("q") ?? "").trim();
  const filter = searchParams.get("filter") ?? "";
  const radiusParam = searchParams.get("radius_miles");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let radiusMiles = 25;
  let noisePreference: string | null = null;
  let needsOutlets = false;
  let needsWifi = false;
  let hasPreferences = false;

  if (radiusParam != null && radiusParam !== "") {
    const parsed = Number(radiusParam);
    if (!Number.isNaN(parsed) && parsed > 0) radiusMiles = parsed;
  } else if (user) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("radius_miles, noise_preference, needs_outlets, needs_wifi")
      .eq("user_id", user.id)
      .single();
    if (prefs) {
      radiusMiles = Number(prefs.radius_miles) || 25;
      noisePreference = prefs.noise_preference;
      needsOutlets = prefs.needs_outlets ?? false;
      needsWifi = prefs.needs_wifi ?? false;
      hasPreferences = true;
    }
  }

  console.log(
    '[feed] After loading user preferences',
    Date.now() - startTime,
    'ms',
  );

  const { data: rows, error: rpcError } = await supabase.rpc(
    "get_feed_places",
    {
      user_lat: lat,
      user_lng: lng,
      radius_miles: radiusMiles,
      search_q: q || null,
      filter_chip: filter || null,
    },
  );

  console.log(
    '[feed] After get_feed_places RPC returns',
    Date.now() - startTime,
    'ms',
  );

  if (rpcError) {
    console.error("[feed] get_feed_places RPC error:", rpcError);
    const message =
      process.env.NODE_ENV === "development"
        ? (rpcError.message ?? "Feed unavailable")
        : "Feed unavailable";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }

  const placeList = rows ?? [];
  console.log(
    "[feed] RPC returned",
    placeList.length,
    "places; lat=",
    lat,
    "lng=",
    lng,
    "radius_miles=",
    radiusMiles,
  );
  const placeIds = placeList.map((r: { id: string }) => r.id);

  // Manually promoted vibe photos live in Supabase Storage (public bucket),
  // and we need to include vibe_photo_path in the feed response for anon + authed users.
  let vibePhotoPathByPlaceId: Record<string, string | null> = {};
  if (placeIds.length > 0) {
    const serviceClient = createServiceRoleClient();
    const { data: placeRows } = await serviceClient
      .from("places")
      .select("id, vibe_photo_path")
      .in("id", placeIds);

    if (placeRows) {
      vibePhotoPathByPlaceId = Object.fromEntries(
        placeRows.map((r) => [r.id as string, (r.vibe_photo_path as string | null) ?? null]),
      );
    }
  }

  let pillsByPlace: Record<string, string[]> = {};
  if (placeIds.length > 0) {
    const { data: ratings } = await supabase
      .from("ratings")
      .select("place_id, pills, updated_at")
      .in("place_id", placeIds)
      .order("updated_at", { ascending: false });

    console.log(
      '[feed] After loading user ratings for implied preferences',
      Date.now() - startTime,
      'ms',
    );

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

  let favorites: Set<string> = new Set();
  if (user) {
    const { data: favRows } = await supabase
      .from("favorites")
      .select("place_id")
      .eq("user_id", user.id)
      .in("place_id", placeIds);
    if (favRows) {
      favorites = new Set(favRows.map((r: { place_id: string }) => r.place_id));
    }
  }

  const radiusMeters = radiusMiles * 1609.344;
  function distanceMeters(row: { lat: number; lng: number }): number {
    const R = 6371000;
    const dLat = ((row.lat - lat) * Math.PI) / 180;
    const dLng = ((row.lng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((row.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const prefsForScore = {
    radius_miles: radiusMiles,
    noise_preference: noisePreference,
    needs_outlets: needsOutlets,
    needs_wifi: needsWifi,
    hasPreferences,
  };

  const LOW_DATA_THRESHOLD = 1;

  const items: (FeedItem & { _distanceMeters: number; _score: number })[] = (
    rows ?? []
  ).map((row: PlaceStatsRow) => {
    const dist = distanceMeters(row);
    const { score, reasons } = computeMatchScore(row, dist, prefsForScore);
    const opening = deriveOpeningState(
      row.opening_hours as Parameters<typeof deriveOpeningState>[0],
      row.timezone,
    );
    const openLate =
      filter === "open_late"
        ? true
        : hasOpenLate(
            row.opening_hours as Parameters<typeof hasOpenLate>[0],
            row.timezone,
          );

    const ratingCount = Number(row.rating_count ?? 0);
    const lowData = ratingCount < LOW_DATA_THRESHOLD;
    const placeNoise = placeNoiseToLabel(row.place_noise_level ?? null);
    const placeTables = placeTablesToLabel(row.place_tables_level ?? null);
    const placeOutlets = placeOutletsToLabel(row.place_outlets_level ?? null);
    const raw = row as Record<string, unknown>;
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
      noise: placeNoise ?? (lowData ? null : dominantNoise(row)),
      dominant_vibe: lowData ? null : dominantVibe(row),
      tables: placeTables ?? (lowData ? null : dominantTables(row)),
      outlets: placeOutlets ?? (lowData ? null : dominantOutlets(row)),
      match_score_percent: score,
      why_matched: reasons,
      open_now: opening.open_now,
      closes_at: opening.closes_at,
      closing_soon: opening.closing_soon,
      open_late: openLate,
      pills: pillsByPlace[row.id] ?? [],
      is_favorited: favorites.has(row.id),
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
      _score: score,
    };
  });

  items.sort((a, b) => b._score - a._score);
  const result = items
    .slice(0, 20)
    .map(({ _distanceMeters: _d, _score: _s, ...item }): FeedItem => item);

  console.log(
    '[feed] Just before returning response',
    Date.now() - startTime,
    'ms',
  );

  return NextResponse.json({ data: result, error: null });
}
