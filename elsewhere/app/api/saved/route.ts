import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileFullName } from "@/lib/ensureProfileFullName";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildFeedItemsFromPlaces,
  type PlaceStatsRow,
} from "@/lib/feedItemsFromPlaces";

/**
 * Full feed-shaped cards for the current user's saved places (no geo / radius).
 * Order matches `saved.saved_at` descending.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { data: savedRows, error: savedError } = await supabase
    .from("saved")
    .select("place_id, saved_at")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (savedError) {
    console.error("[saved] list error:", savedError);
    return NextResponse.json(
      { error: savedError.message ?? "Failed to load saved places" },
      { status: 500 },
    );
  }

  if (!savedRows?.length) {
    return NextResponse.json({ data: [], error: null });
  }

  /** Unique ids, preserving saved_at desc (first row per place wins). */
  const orderedIds: string[] = [];
  const seenId = new Set<string>();
  for (const row of savedRows) {
    const id = row.place_id as string;
    if (!id || seenId.has(id)) continue;
    seenId.add(id);
    orderedIds.push(id);
  }
  const serviceClient = createServiceRoleClient();

  // Load saved places without is_active filtering — users may have saved before flags/columns
  // matched production, and we still want to show their list.
  const { data: placeRows, error: placesError } = await serviceClient
    .from("places")
    .select("*")
    .in("id", orderedIds);

  if (placesError) {
    console.error("[saved] places error:", placesError);
    return NextResponse.json(
      { error: placesError.message ?? "Failed to load places" },
      { status: 500 },
    );
  }

  const { data: statRows, error: statsError } = await serviceClient
    .from("place_stats")
    .select("*")
    .in("place_id", orderedIds);

  if (statsError) {
    console.error("[saved] place_stats error:", statsError);
    return NextResponse.json(
      { error: statsError.message ?? "Failed to load place stats" },
      { status: 500 },
    );
  }

  const placeById = new Map(
    (placeRows ?? []).map((p) => [String(p.id), p]),
  );
  const statsById = new Map(
    (statRows ?? []).map((s) => [String(s.place_id), s]),
  );

  const emptyStats = (
    placeId: string,
  ): Record<string, string | number | bigint | null> => ({
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
    outlets_none: 0,
    outlets_limited: 0,
    vibe_focused: 0,
    vibe_focus: 0,
    vibe_casual: 0,
    vibe_mixed: 0,
    vibe_social: 0,
  });

  const placeList: PlaceStatsRow[] = [];
  for (const id of orderedIds) {
    const p = placeById.get(id);
    if (!p) continue;

    const statsRaw = statsById.get(id) ?? emptyStats(id);
    const stats = statsRaw as Record<string, unknown>;
    const vibeFocused =
      (stats.vibe_focused as number | bigint | undefined) ??
      (stats.vibe_focus as number | bigint | undefined) ??
      0;
    const vibeCasual =
      (stats.vibe_casual as number | bigint | undefined) ??
      (stats.vibe_mixed as number | bigint | undefined) ??
      0;

    placeList.push({
      id: p.id as string,
      name: p.name as string,
      address: p.address as string,
      lat: Number(p.lat),
      lng: Number(p.lng),
      place_type: p.place_type as string,
      opening_hours:
        (p.opening_hours as Record<string, unknown> | null) ?? null,
      timezone: (p.timezone as string | null) ?? null,
      google_photo_ref: (p.google_photo_ref as string | null) ?? null,
      vibe_photo_ref: (p.vibe_photo_ref as string | null) ?? null,
      vibe_photo_attribution: p.vibe_photo_attribution ?? null,
      cost: ((p as { cost?: string | null }).cost as string | null) ?? null,
      rating_count: stats.rating_count as number | bigint,
      avg_overall_rating:
        (stats.avg_overall_rating as number | string | null) ?? null,
      noise_silent: (stats.noise_silent as number | bigint) ?? 0,
      noise_quiet: (stats.noise_quiet as number | bigint) ?? 0,
      noise_vibrant: (stats.noise_vibrant as number | bigint) ?? 0,
      tables_limited: (stats.tables_limited as number | bigint) ?? 0,
      tables_mixed: (stats.tables_mixed as number | bigint) ?? 0,
      tables_plentiful: (stats.tables_plentiful as number | bigint | undefined) ?? 0,
      outlets_scarce:
        (stats.outlets_scarce as number | bigint | undefined) ??
        (stats.outlets_none as number | bigint | undefined) ??
        0,
      outlets_some:
        (stats.outlets_some as number | bigint | undefined) ??
        (stats.outlets_limited as number | bigint | undefined) ??
        0,
      outlets_ample: (stats.outlets_ample as number | bigint) ?? 0,
      vibe_focused: vibeFocused as number | bigint,
      vibe_casual: vibeCasual as number | bigint,
      vibe_social: (stats.vibe_social as number | bigint) ?? 0,
    });
  }

  if (placeList.length === 0) {
    return NextResponse.json({ data: [], error: null });
  }

  const refLat =
    placeList.reduce((sum, r) => sum + r.lat, 0) / placeList.length;
  const refLng =
    placeList.reduce((sum, r) => sum + r.lng, 0) / placeList.length;

  const savedIdSet = new Set(orderedIds);
  const idOrder = placeList.map((pl) => pl.id);

  const raw = await buildFeedItemsFromPlaces({
    supabase,
    serviceRoleClient: serviceClient,
    ratingsClient: serviceClient,
    userId: user.id,
    placeList,
    refLat,
    refLng,
    filterChip: "",
    favoritedPlaceIds: savedIdSet,
    idOrder,
  });

  const dedupedIds = new Set<string>();
  const data = raw.filter((item) => {
    if (!item.id || dedupedIds.has(item.id)) return false;
    dedupedIds.add(item.id);
    return true;
  });

  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { place_id } = body as { place_id?: string };

  if (!place_id || typeof place_id !== "string") {
    return NextResponse.json(
      { error: "place_id is required" },
      { status: 400 },
    );
  }

  const serviceClient = createServiceRoleClient();
  await ensureProfileFullName(serviceClient, user);

  // saved.user_id FK → profiles(id) (not auth.users). Users who never hit a profile write
  // can still have a valid session — inserts would fail with FK violation without this row.
  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await serviceClient
      .from("profiles")
      .insert({ id: user.id });
    if (profileError) {
      if (profileError.code !== "23505") {
        console.error("[saved] profile bootstrap error:", profileError);
        return NextResponse.json(
          {
            error:
              profileError.message ??
              "Could not prepare your account to save places",
          },
          { status: 500 },
        );
      }
      // 23505: concurrent insert won the race — safe to continue
    }
  }

  const { data: place, error: placeError } = await serviceClient
    .from("places")
    .select("id, is_active")
    .eq("id", place_id)
    .maybeSingle();

  if (placeError || !place) {
    return NextResponse.json({ error: "Place not found" }, { status: 400 });
  }

  if (!place.is_active) {
    return NextResponse.json(
      { error: "Cannot save an inactive place" },
      { status: 400 },
    );
  }

  // Use service role so the write succeeds regardless of RLS quirks in API routes;
  // `user.id` is already verified via the session client above.
  const { error: insertError } = await serviceClient
    .from("saved")
    .upsert(
      { user_id: user.id, place_id },
      { onConflict: "user_id,place_id" },
    );

  if (insertError) {
    console.error("[saved] insert error:", insertError);
    return NextResponse.json(
      { error: insertError.message ?? "Failed to save place" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
