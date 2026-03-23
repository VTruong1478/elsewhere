import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildFeedItemsFromPlaces,
  type PlaceStatsRow,
} from "@/lib/feedItemsFromPlaces";

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

  if (radiusParam != null && radiusParam !== "") {
    const parsed = Number(radiusParam);
    if (!Number.isNaN(parsed) && parsed > 0) radiusMiles = parsed;
  } else if (user) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("radius_miles")
      .eq("user_id", user.id)
      .single();
    if (prefs) {
      radiusMiles = Number(prefs.radius_miles) || 25;
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
  const serviceRoleClient = createServiceRoleClient();

  let savedPlaceIds: Set<string> = new Set();
  if (user) {
    const { data: savedRows } = await supabase
      .from("saved")
      .select("place_id")
      .eq("user_id", user.id)
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
    userId: user?.id ?? null,
    placeList: placeList as PlaceStatsRow[],
    refLat: lat,
    refLng: lng,
    filterChip: filter,
    favoritedPlaceIds: savedPlaceIds,
    limit: 20,
  });

  if (q) {
    const normalizedQuery = q.toLowerCase();
    result = result.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery),
    );
  }

  console.log(
    '[feed] Just before returning response',
    Date.now() - startTime,
    'ms',
  );

  return NextResponse.json({ data: result, error: null });
}
