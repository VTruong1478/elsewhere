import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildFeedItemsFromPlaces,
  type PlaceStatsRow,
} from "@/lib/feedItemsFromPlaces";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const lat = latParam != null ? parseFloat(latParam) : NaN;
  const lng = lngParam != null ? parseFloat(lngParam) : NaN;

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
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const serviceRoleClient = createServiceRoleClient();
  const actingUser = user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceRoleClient, "route.ts")
      : null);

  let radiusMiles = 25;

  const actingReader = user ? supabase : serviceRoleClient;

  if (radiusParam != null && radiusParam !== "") {
    const parsed = Number(radiusParam);
    if (!Number.isNaN(parsed) && parsed > 0) radiusMiles = parsed;
  } else if (actingUser) {
    const { data: prefs } = await actingReader
      .from("user_preferences")
      .select("radius_miles")
      .eq("user_id", actingUser.id)
      .single();
    if (prefs) {
      radiusMiles = Number(prefs.radius_miles) || 25;
    }
  }

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

  if (rpcError) {
    console.error("[feed] get_feed_places RPC error:", rpcError);
    const message =
      process.env.NODE_ENV === "development"
        ? (rpcError.message ?? "Feed unavailable")
        : "Feed unavailable";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }

  const placeList = rows ?? [];
  const placeIds = placeList.map((r: { id: string }) => r.id);

  let savedPlaceIds: Set<string> = new Set();
  if (actingUser) {
    const { data: savedRows } = await actingReader
      .from("saved")
      .select("place_id")
      .eq("user_id", actingUser.id)
      .in("place_id", placeIds);
    if (savedRows) {
      savedPlaceIds = new Set(
        savedRows.map((r: { place_id: string }) => r.place_id),
      );
    }
  }

  let result = await buildFeedItemsFromPlaces({
    supabase,
    serviceRoleClient,
    userId: actingUser?.id ?? null,
    placeList: placeList as PlaceStatsRow[],
    refLat: lat,
    refLng: lng,
    filterChip: filter,
    favoritedPlaceIds: savedPlaceIds,
  });

  if (q) {
    const normalizedQuery = q.toLowerCase();
    result = result.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery),
    );
  }

  return NextResponse.json({ data: result, error: null });
}
