import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type PlaceStatsRow = {
  place_id: string;
  rating_count: number | bigint;
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
  avg_overall_rating: number | string | null;
};

type PlaceRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  has_wifi: boolean | null;
  opening_hours: unknown;
  timezone: string | null;
  google_photo_ref: string | null;
  vibe_photo_ref: string | null;
  vibe_photo_path: string | null;
  vibe_photo_attribution: unknown;
};

function toInitial(fullName: string | null | undefined): string {
  const v = (fullName ?? "").trim();
  if (!v) return "?";
  return v.charAt(0).toUpperCase();
}

type RatingNoteRow = {
  id: string;
  notes: string | null;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string | null;
  } | null;
};

function emptyPlaceStats(placeId: string): PlaceStatsRow {
  return {
    place_id: placeId,
    rating_count: 0,
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
    avg_overall_rating: null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;

  try {
    const supabase = await createClient();
    const serviceClient = createServiceRoleClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1) Place row + place_stats (server-side, no user_id exposure)
    const { data: place } = await serviceClient
      .from("places")
      .select(
        "id, name, address, lat, lng, place_type, has_wifi, opening_hours, timezone, google_photo_ref, vibe_photo_ref, vibe_photo_path, vibe_photo_attribution",
      )
      .eq("id", placeId)
      .maybeSingle<PlaceRow>();

    const { data: place_stats } = await serviceClient
      .from("place_stats")
      .select("*")
      .eq("place_id", placeId)
      .maybeSingle<PlaceStatsRow>();

    if (!place) {
      return NextResponse.json(
        { data: null, error: "Place not found" },
        { status: 404 },
      );
    }

    const stats = place_stats ?? emptyPlaceStats(placeId);

    // 2) Whether the user saved it
    let is_saved = false;
    if (user) {
      const { data: row } = await supabase
        .from("saved")
        .select("place_id")
        .eq("user_id", user.id)
        .eq("place_id", placeId)
        .maybeSingle();
      is_saved = !!row;
    }

    // 3) Notes (notes != null) from ratings_public when available, otherwise fall back to raw ratings.
    // We return only user initials (no user_id exposure in the response).
    let notes: Array<{
      id: string;
      notes: string;
      created_at: string;
      user_initial: string;
    }> = [];

    const extractNotes = (rows: unknown[]) => {
      return rows
        .filter(
          (r): r is { notes: string | null } =>
            typeof (r as { notes?: unknown }).notes === "string" &&
            ((r as { notes?: string }).notes ?? "").trim().length > 0,
        )
        .slice(0, 30)
        .map((r) => {
          const row = r as RatingNoteRow;
          return {
            id: String(row.id),
            notes: String(row.notes ?? ""),
            created_at: new Date(row.created_at).toISOString(),
            user_initial: toInitial(row.profiles?.full_name),
          };
        });
    };

    let ratingsRows: unknown[] = [];
    try {
      const { data: ratingsPublicNotes } = await serviceClient
        .from("ratings_public")
        .select("id, notes, created_at, user_id, profiles(full_name)")
        .eq("place_id", placeId)
        .order("created_at", { ascending: false })
        .limit(30);
      ratingsRows = Array.isArray(ratingsPublicNotes)
        ? ratingsPublicNotes
        : [];
    } catch {
      // Ignore and fall back to raw ratings query below.
    }

    if (ratingsRows.length === 0) {
      const { data: ratingsNotes } = await serviceClient
        .from("ratings")
        .select("id, notes, created_at, user_id, profiles(full_name)")
        .eq("place_id", placeId)
        .order("created_at", { ascending: false })
        .limit(30);
      ratingsRows = Array.isArray(ratingsNotes) ? ratingsNotes : [];
    }

    notes = extractNotes(ratingsRows);

    return NextResponse.json({
      data: {
        place: {
          ...place,
          lat: Number(place.lat),
          lng: Number(place.lng),
        },
        place_stats: { ...stats },
        is_saved,
        notes,
      },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}

