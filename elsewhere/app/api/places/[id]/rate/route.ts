import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const NOISE_VALUES = ["silent", "quiet", "vibrant"] as const;
const VIBE_VALUES = ["focused", "casual", "social"] as const;
const TABLES_VALUES = ["limited", "mixed", "plentiful"] as const;
const OUTLETS_VALUES = ["scarce", "some", "ample"] as const;
const MAX_RATINGS_PER_DAY = 100;

function startOfTodayUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function isValidOverallRating(v: unknown): v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (v < 0 || v > 5) return false;
  return v * 2 === Math.floor(v * 2);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;

  // 1. Authenticate
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

  const serviceClient = createServiceRoleClient();

  // 2. Rate limit: max 100 ratings per user per UTC day
  const { count, error: countError } = await serviceClient
    .from("ratings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfTodayUTC());

  if (countError) {
    console.error("[rate] rate limit check error:", countError);
    return NextResponse.json(
      { error: "Failed to check rate limit" },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= MAX_RATINGS_PER_DAY) {
    return NextResponse.json(
      { error: "Rating limit reached (100 per day)" },
      { status: 429 },
    );
  }

  // 3. Check place exists and is_active
  const { data: place, error: placeError } = await serviceClient
    .from("places")
    .select("id, is_active")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return NextResponse.json({ error: "Place not found" }, { status: 400 });
  }

  if (!place.is_active) {
    return NextResponse.json(
      { error: "Cannot rate an inactive place" },
      { status: 400 },
    );
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { noise, vibe, tables, outlets, overall_rating, photo_path, notes } =
    body as {
      noise?: string;
      vibe?: string;
      tables?: string;
      outlets?: string;
      overall_rating?: unknown;
      photo_path?: string;
      notes?: string;
    };

  // 4. Validate required fields
  if (!noise || !NOISE_VALUES.includes(noise as any)) {
    return NextResponse.json(
      {
        error: `noise is required and must be one of: ${NOISE_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!vibe || !VIBE_VALUES.includes(vibe as any)) {
    return NextResponse.json(
      {
        error: `vibe is required and must be one of: ${VIBE_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!tables || !TABLES_VALUES.includes(tables as any)) {
    return NextResponse.json(
      {
        error: `tables is required and must be one of: ${TABLES_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!outlets || !OUTLETS_VALUES.includes(outlets as any)) {
    return NextResponse.json(
      {
        error: `outlets is required and must be one of: ${OUTLETS_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // 5. Validate overall_rating: number, 0–5, 0.5 increments
  if (overall_rating == null || !isValidOverallRating(Number(overall_rating))) {
    return NextResponse.json(
      {
        error:
          "overall_rating is required and must be a number between 0 and 5 in 0.5 increments",
      },
      { status: 400 },
    );
  }

  // 7. Validate photo_path contains user's id if provided
  if (photo_path != null && photo_path !== "") {
    if (!photo_path.includes(user.id)) {
      return NextResponse.json(
        { error: "photo_path must contain your user id" },
        { status: 400 },
      );
    }
  }

  // 6. Upsert into ratings (user client so RLS applies)
  const ratingRow: Record<string, unknown> = {
    place_id: placeId,
    user_id: user.id,
    noise,
    vibe,
    tables,
    outlets,
    overall_rating: Number(overall_rating),
    notes: notes ?? null,
    photo_path: photo_path && photo_path.includes(user.id) ? photo_path : null,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await supabase
    .from("ratings")
    .upsert(ratingRow, { onConflict: "user_id,place_id" })
    .select()
    .single();

  if (upsertError) {
    console.error("[rate] upsert error:", upsertError);
    return NextResponse.json(
      { error: upsertError.message ?? "Failed to save rating" },
      { status: 500 },
    );
  }

  // 8. Return the upserted rating
  return NextResponse.json({ data: upserted, error: null });
}
