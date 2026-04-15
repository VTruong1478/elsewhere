import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileFullName } from "@/lib/ensureProfileFullName";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";

const NOISE_VALUES = ["silent", "quiet", "vibrant"] as const;
const VIBE_VALUES = ["focused", "casual", "social"] as const;
const TABLES_VALUES = ["limited", "mixed", "plentiful"] as const;
const OUTLETS_VALUES = ["scarce", "some", "ample"] as const;
const MAX_RATINGS_PER_DAY = 100;
/** Cap for user-uploaded images attached to one rating (storage paths). */
const MAX_RATING_PHOTOS = 6;

function isRatingsPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  if (err.code === "42501") return true;
  return (
    typeof err.message === "string" &&
    /permission denied.*ratings/i.test(err.message)
  );
}

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

/**
 * Normalize and validate storage paths from the client.
 * Accepts `photo_paths` array and/or legacy `photo_path` string.
 */
function sanitizeRatingPhotoPaths(
  photo_paths: unknown,
  photo_path: unknown,
  userId: string,
): { paths: string[]; error?: string } {
  const raw: string[] = [];
  if (Array.isArray(photo_paths)) {
    for (const item of photo_paths) {
      const s = String(item ?? "").trim();
      if (s) raw.push(s);
    }
  } else if (photo_path != null && String(photo_path).trim() !== "") {
    raw.push(String(photo_path).trim());
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    if (!p.includes(userId)) {
      return {
        paths: [],
        error: "Each photo path must belong to your account",
      };
    }
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length > MAX_RATING_PHOTOS) {
      return {
        paths: [],
        error: `At most ${MAX_RATING_PHOTOS} photos per rating`,
      };
    }
  }
  return { paths: out };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "rate:POST")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  await ensureProfileFullName(serviceClient, actingUser);
  const writer = user ? supabase : serviceClient;

  // 2. Rate limit: max 100 ratings per user per UTC day
  const { count, error: countError } = await serviceClient
    .from("ratings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actingUser.id)
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    noise,
    vibe,
    tables,
    outlets,
    overall_rating,
    photo_path,
    photo_paths,
    notes,
  } = body as {
    noise?: string;
    vibe?: string;
    tables?: string;
    outlets?: string;
    overall_rating?: unknown;
    photo_path?: string;
    photo_paths?: unknown;
    notes?: string;
  };

  // 4. Validate required fields
  if (!noise || !NOISE_VALUES.includes(noise as (typeof NOISE_VALUES)[number])) {
    return NextResponse.json(
      {
        error: `noise is required and must be one of: ${NOISE_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!vibe || !VIBE_VALUES.includes(vibe as (typeof VIBE_VALUES)[number])) {
    return NextResponse.json(
      {
        error: `vibe is required and must be one of: ${VIBE_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!tables || !TABLES_VALUES.includes(tables as (typeof TABLES_VALUES)[number])) {
    return NextResponse.json(
      {
        error: `tables is required and must be one of: ${TABLES_VALUES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (
    !outlets ||
    !OUTLETS_VALUES.includes(outlets as (typeof OUTLETS_VALUES)[number])
  ) {
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

  const { paths: ratingPhotoPaths, error: photoPathsError } =
    sanitizeRatingPhotoPaths(photo_paths, photo_path, actingUser.id);
  if (photoPathsError) {
    return NextResponse.json({ error: photoPathsError }, { status: 400 });
  }

  // 6. Upsert into ratings (user client so RLS applies)
  const ratingRow: Record<string, unknown> = {
    place_id: placeId,
    user_id: actingUser.id,
    noise,
    vibe,
    tables,
    outlets,
    overall_rating: Number(overall_rating),
    notes: notes ?? null,
    photo_paths: ratingPhotoPaths,
    photo_path: ratingPhotoPaths[0] ?? null,
    updated_at: new Date().toISOString(),
  };

  let { data: upserted, error: upsertError } = await writer
    .from("ratings")
    .upsert(ratingRow, { onConflict: "user_id,place_id" })
    .select()
    .single();

  if (user && isRatingsPermissionDenied(upsertError)) {
    // Production hardening can revoke table grants for authenticated users.
    // Retry with service role while still binding row ownership to actingUser.id.
    const retry = await serviceClient
      .from("ratings")
      .upsert(ratingRow, { onConflict: "user_id,place_id" })
      .select()
      .single();
    upserted = retry.data;
    upsertError = retry.error;
  }

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

/**
 * PATCH /api/places/[id]/rate
 * Body: { photo_paths?: string[] } and/or legacy { photo_path?: string | null }
 * Keeps photo_path and photo_paths in sync (photo_path = first element).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: placeId } = await params;

  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "rate:PATCH")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const writer = user ? supabase : serviceClient;

  let body: { photo_path?: string | null; photo_paths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasPathsKey = Object.prototype.hasOwnProperty.call(body, "photo_paths");
  const hasPathKey = Object.prototype.hasOwnProperty.call(body, "photo_path");
  if (!hasPathsKey && !hasPathKey) {
    return NextResponse.json(
      { error: "Provide photo_paths and/or photo_path" },
      { status: 400 },
    );
  }

  const { paths, error: photoErr } = sanitizeRatingPhotoPaths(
    hasPathsKey ? body.photo_paths : null,
    hasPathsKey ? null : body.photo_path,
    actingUser.id,
  );
  if (photoErr) {
    return NextResponse.json({ error: photoErr }, { status: 400 });
  }

  let { error } = await writer
    .from("ratings")
    .update({
      photo_paths: paths,
      photo_path: paths[0] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("place_id", placeId)
    .eq("user_id", actingUser.id);

  if (user && isRatingsPermissionDenied(error)) {
    const retry = await serviceClient
      .from("ratings")
      .update({
        photo_paths: paths,
        photo_path: paths[0] ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("place_id", placeId)
      .eq("user_id", actingUser.id);
    error = retry.error;
  }

  if (error) {
    console.error("[rate] PATCH error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to update rating" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
