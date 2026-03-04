import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deriveOpeningState, hasOpenLate } from '@/lib/opening-hours';
import type { FeedItem } from '@/types/feed';
import type { NoiseLabel, TablesLabel, OutletsLabel } from '@/types/feed';

type PlaceStatsRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  opening_hours: Record<string, unknown> | null;
  timezone: string | null;
  rating_count: number;
  noise_silent: number;
  noise_quiet: number;
  noise_vibrant: number;
  tables_limited: number;
  tables_mixed: number;
  tables_ideal: number;
  outlets_none: number;
  outlets_limited: number;
  outlets_ample: number;
};

function dominantNoise(row: PlaceStatsRow): NoiseLabel | null {
  const max = Math.max(row.noise_silent, row.noise_quiet, row.noise_vibrant);
  if (max === 0) return null;
  if (row.noise_quiet === max) return 'Quiet';
  if (row.noise_vibrant === max) return 'Vibrant';
  return 'Silent';
}

function dominantTables(row: PlaceStatsRow): TablesLabel | null {
  const max = Math.max(row.tables_limited, row.tables_mixed, row.tables_ideal);
  if (max === 0) return null;
  if (row.tables_ideal === max) return 'Ideal';
  if (row.tables_mixed === max) return 'Mixed';
  return 'Limited';
}

function dominantOutlets(row: PlaceStatsRow): OutletsLabel | null {
  const max = Math.max(row.outlets_none, row.outlets_limited, row.outlets_ample);
  if (max === 0) return null;
  if (row.outlets_ample === max) return 'Ample';
  if (row.outlets_limited === max) return 'Limited';
  return 'None';
}

function computeMatchScore(
  row: PlaceStatsRow,
  distanceMeters: number,
  prefs: { radius_miles: number; noise_preference: string | null; needs_outlets: boolean; needs_wifi: boolean }
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50;
  const radiusMeters = prefs.radius_miles * 1609.344;
  if (distanceMeters <= radiusMeters) {
    const distanceScore = Math.max(0, 30 - (distanceMeters / radiusMeters) * 20);
    score += distanceScore;
    if (distanceMeters < radiusMeters * 0.5) reasons.push('Close to you');
  }
  const noise = dominantNoise(row);
  if (noise && prefs.noise_preference && noise.toLowerCase() === prefs.noise_preference) {
    score += 15;
    reasons.push(noise);
  }
  const outlets = dominantOutlets(row);
  if (prefs.needs_outlets && outlets === 'Ample') {
    score += 10;
    reasons.push('Ample outlets');
  }
  const dampener = row.rating_count < 2 ? 0.6 : row.rating_count < 4 ? 0.8 : 1;
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
  const { searchParams } = new URL(request.url);
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const lat = latParam != null ? parseFloat(latParam) : NaN;
  const lng = lngParam != null ? parseFloat(lngParam) : NaN;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const q = (searchParams.get('q') ?? '').trim();
  const filter = searchParams.get('filter') ?? '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Default prefs when not signed in (bypass for now)
  let radiusMiles = 10;
  let noisePreference: string | null = null;
  let needsOutlets = false;
  let needsWifi = false;

  if (user) {
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('radius_miles, noise_preference, needs_outlets, needs_wifi')
      .eq('user_id', user.id)
      .single();
    if (prefs) {
      radiusMiles = Number(prefs.radius_miles) || 10;
      noisePreference = prefs.noise_preference;
      needsOutlets = prefs.needs_outlets ?? false;
      needsWifi = prefs.needs_wifi ?? false;
    }
  }

  const { data: rows, error: rpcError } = await supabase.rpc('get_feed_places', {
    user_lat: lat,
    user_lng: lng,
    radius_miles: radiusMiles,
    search_q: q || null,
    filter_chip: filter || null,
  });

  if (rpcError) {
    return NextResponse.json(
      { error: 'Feed unavailable', details: rpcError.message },
      { status: 500 }
    );
  }

  const placeIds = (rows ?? []).map((r: { id: string }) => r.id);
  let pillsByPlace: Record<string, string[]> = {};
  if (placeIds.length > 0) {
    const { data: ratings } = await supabase
      .from('ratings')
      .select('place_id, pills, updated_at')
      .in('place_id', placeIds)
      .order('updated_at', { ascending: false });
    const byPlace: Record<string, { pills: string[] }[]> = {};
    for (const row of ratings ?? []) {
      const id = row.place_id;
      if (!byPlace[id]) byPlace[id] = [];
      if (byPlace[id].length < 20 && Array.isArray(row.pills) && row.pills.length > 0) {
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
      .from('favorites')
      .select('place_id')
      .eq('user_id', user.id)
      .in('place_id', placeIds);
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
  };

  const items: (FeedItem & { _distanceMeters: number; _score: number })[] = (rows ?? []).map(
    (row: PlaceStatsRow) => {
      const dist = distanceMeters(row);
      const { score, reasons } = computeMatchScore(
        row,
        dist,
        prefsForScore
      );
      const opening = deriveOpeningState(
        row.opening_hours as Parameters<typeof deriveOpeningState>[0],
        row.timezone
      );
      const openLate =
        filter === 'open_late'
          ? true
          : hasOpenLate(
              row.opening_hours as Parameters<typeof hasOpenLate>[0],
              row.timezone
            );

      return {
        id: row.id,
        name: row.name,
        address: row.address,
        lat: Number(row.lat),
        lng: Number(row.lng),
        place_type: row.place_type,
        noise: dominantNoise(row),
        tables: dominantTables(row),
        outlets: dominantOutlets(row),
        match_score_percent: row.rating_count >= 2 ? score : null,
        why_matched: reasons,
        open_now: opening.open_now,
        closes_at: opening.closes_at,
        closing_soon: opening.closing_soon,
        open_late: openLate,
        pills: pillsByPlace[row.id] ?? [],
        is_favorited: favorites.has(row.id),
        _distanceMeters: dist,
        _score: score,
      };
    }
  );

  items.sort((a, b) => b._score - a._score);
  const result = items.slice(0, 20).map(
    ({
      _distanceMeters: _d,
      _score: _s,
      ...item
    }): FeedItem => item
  );

  return NextResponse.json(result);
}
