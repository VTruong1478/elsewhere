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

/** Current user's rating row returned only for the authenticated subject (backend-plan §6 GET /api/places/[id]). */
type MyRatingRow = {
  id: string;
  noise: string;
  vibe: string;
  tables: string;
  outlets: string;
  overall_rating: number;
  photo_path: string | null;
  photo_paths: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Supabase returns Postgres integer/count columns as bigint in Node. JSON.stringify
 * (used by NextResponse.json) cannot serialize BigInt — the handler would throw 500
 * and the place detail panel would receive no data. Normalize to numbers.
 */
function serializePlaceStats(stats: PlaceStatsRow) {
  return {
    place_id: stats.place_id,
    rating_count: Number(stats.rating_count),
    noise_silent: Number(stats.noise_silent),
    noise_quiet: Number(stats.noise_quiet),
    noise_vibrant: Number(stats.noise_vibrant),
    tables_limited: Number(stats.tables_limited),
    tables_mixed: Number(stats.tables_mixed),
    tables_plentiful: Number(stats.tables_plentiful),
    outlets_scarce: Number(stats.outlets_scarce),
    outlets_some: Number(stats.outlets_some),
    outlets_ample: Number(stats.outlets_ample),
    vibe_focused: Number(stats.vibe_focused),
    vibe_casual: Number(stats.vibe_casual),
    vibe_social: Number(stats.vibe_social),
    avg_overall_rating:
      stats.avg_overall_rating == null
        ? null
        : typeof stats.avg_overall_rating === "number"
          ? stats.avg_overall_rating
          : Number(stats.avg_overall_rating),
  };
}

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const placeId = typeof rawId === "string" ? rawId.trim() : "";

  try {
    const supabase = await createClient();
    const serviceClient = createServiceRoleClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1) Place row + place_stats (server-side, no user_id exposure)
    // Use select('*') so a missing optional column (e.g. added in dashboard but not in
    // every env) does not make PostgREST return an error — explicit column lists then
    // yield data: null and this handler incorrectly returned 404.
    const {
      data: place,
      error: placeError,
    } = await serviceClient
      .from("places")
      .select("*")
      .eq("id", placeId)
      .maybeSingle<PlaceRow>();

    if (placeError) {
      console.error("[GET /api/places/[id]] places query", placeError);
      return NextResponse.json(
        { data: null, error: "Failed to load place" },
        { status: 500 },
      );
    }

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

    // 2) Current user's own rating (raw `ratings` via service role only; never exposed to other clients)
    let my_rating: MyRatingRow | null = null;
    if (user) {
      const { data: mine } = await serviceClient
        .from("ratings")
        .select(
          "id, noise, vibe, tables, outlets, overall_rating, photo_path, photo_paths, notes, created_at, updated_at",
        )
        .eq("place_id", placeId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (mine && typeof mine === "object") {
        const m = mine as Record<string, unknown>;
        const legacyPath =
          m.photo_path == null ? null : String(m.photo_path as string);
        const rawArr = m.photo_paths as string[] | null | undefined;
        const pathsFromDb =
          Array.isArray(rawArr) && rawArr.length > 0
            ? rawArr.map((p) => String(p).trim()).filter(Boolean)
            : legacyPath?.trim()
              ? [legacyPath.trim()]
              : [];
        my_rating = {
          id: String(m.id),
          noise: String(m.noise),
          vibe: String(m.vibe),
          tables: String(m.tables),
          outlets: String(m.outlets),
          overall_rating: Number(m.overall_rating),
          photo_path: pathsFromDb[0] ?? legacyPath,
          photo_paths: pathsFromDb.length > 0 ? pathsFromDb : null,
          notes: m.notes == null ? null : String(m.notes as string),
          created_at: new Date(String(m.created_at)).toISOString(),
          updated_at: new Date(String(m.updated_at)).toISOString(),
        };
      }
    }

    // 3) Whether the user saved it
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

    // 4) Notes / tips: `place_notes_public` (author_short_name, created_at, non-hidden notes).
    type PlaceNotePublicRow = {
      rating_id: string;
      notes: string;
      created_at: string;
      author_short_name: string;
    };

    let notes: Array<{
      id: string;
      notes: string;
      created_at: string;
      author_short_name: string;
    }> = [];

    const { data: placeNotesRows, error: placeNotesError } =
      await serviceClient
        .from("place_notes_public")
        .select("rating_id, notes, created_at, author_short_name")
        .eq("place_id", placeId)
        .order("created_at", { ascending: false })
        .limit(30);

    if (placeNotesError) {
      console.error(
        "[GET /api/places/[id]] place_notes_public query",
        placeNotesError,
      );
    }

    notes = Array.isArray(placeNotesRows)
      ? (placeNotesRows as PlaceNotePublicRow[]).map((row) => ({
          id: String(row.rating_id),
          notes: String(row.notes ?? ""),
          created_at: new Date(row.created_at).toISOString(),
          author_short_name: String(row.author_short_name ?? ""),
        }))
      : [];

    return NextResponse.json({
      data: {
        place: {
          ...place,
          lat: Number(place.lat),
          lng: Number(place.lng),
        },
        place_stats: serializePlaceStats(stats),
        is_saved,
        notes,
        my_rating,
      },
      error: null,
    });
  } catch (e) {
    console.error("[GET /api/places/[id]]", e);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}

