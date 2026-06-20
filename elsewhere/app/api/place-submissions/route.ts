import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deriveFullNameFromAuthUser } from "@/lib/ensureProfileFullName";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

interface GooglePlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
}

type MatchConfidence = "high" | "medium" | "low" | "none";

function nameMatchScore(submitted: string, googleName: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  const sa = normalize(submitted);
  const sb = normalize(googleName);

  if (sa === sb) return 1.0;
  if (sb.includes(sa) || sa.includes(sb)) return 0.9;

  const tokens = (s: string) =>
    new Set(normalize(s).split(/\s+/).filter(Boolean));
  const ta = tokens(submitted);
  const tb = tokens(googleName);
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;

  return union === 0 ? 0 : intersection / union;
}

function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

// May throw — callers must catch. Returns "none" only when Google responded with no results.
async function matchGooglePlace(
  submittedName: string,
  submittedAddress: string,
): Promise<{
  googlePlaceId: string | null;
  googleMatchName: string | null;
  googleMatchAddress: string | null;
  matchConfidence: MatchConfidence;
}> {
  const query = `${submittedName} ${submittedAddress}`;

  const res = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });

  if (!res.ok) {
    return {
      googlePlaceId: null,
      googleMatchName: null,
      googleMatchAddress: null,
      matchConfidence: "none",
    };
  }

  const json = (await res.json()) as { places?: GooglePlaceResult[] };
  const result = json.places?.[0] ?? null;

  if (!result?.id) {
    return {
      googlePlaceId: null,
      googleMatchName: null,
      googleMatchAddress: null,
      matchConfidence: "none",
    };
  }

  const googleMatchName = result.displayName?.text ?? null;
  const googleMatchAddress = result.formattedAddress ?? null;
  const score = googleMatchName ? nameMatchScore(submittedName, googleMatchName) : 0;

  return {
    googlePlaceId: result.id,
    googleMatchName,
    googleMatchAddress,
    matchConfidence: scoreToConfidence(score),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devBypass =
    process.env.NODE_ENV === "development" &&
    request.cookies.get("dev_auth")?.value === "1";

  let userId = user?.id ?? null;
  if (!userId) {
    if (!devBypass) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
  }

  let body: {
    place_name?: string;
    address_or_location?: string;
    place_type?: string;
    submitted_from_search?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const place_name = (body.place_name ?? "").trim();
  const address_or_location = (body.address_or_location ?? "").trim();
  const place_type = (body.place_type ?? "").trim();
  const submitted_from_search = (body.submitted_from_search ?? null)
    ? String(body.submitted_from_search).trim()
    : null;

  if (!place_name || !address_or_location || !place_type) {
    return NextResponse.json(
      {
        error:
          "place_name, address_or_location, and place_type are required",
      },
      { status: 400 },
    );
  }

  const serviceClient = createServiceRoleClient();
  if (!userId && devBypass) {
    // Dev bypass has no Supabase session user id. Reuse any existing profile id so
    // place_submissions.user_id FK remains valid.
    const { data: profileRow, error: profileError } = await serviceClient
      .from("profiles")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (profileError || !profileRow?.id) {
      return NextResponse.json(
        {
          error:
            "Dev submit requires at least one real user profile. Log in once with real auth first.",
        },
        { status: 500 },
      );
    }
    userId = String(profileRow.id);
  }

  // Denormalized submitter info for easier moderation in table views.
  let submitterFullName: string | null = null;
  let submitterEmail: string | null = null;

  const { data: profileRow } = await serviceClient
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (typeof profileRow?.full_name === "string") {
    const trimmed = profileRow.full_name.trim();
    submitterFullName = trimmed.length > 0 ? trimmed : null;
  }

  if (user) {
    submitterEmail = user.email ?? null;
    if (!submitterFullName) {
      submitterFullName = deriveFullNameFromAuthUser(user);
    }
  } else if (userId) {
    const { data: adminUserData, error: adminUserError } =
      await serviceClient.auth.admin.getUserById(userId);
    if (!adminUserError) {
      submitterEmail = adminUserData.user?.email ?? null;
    }
  }

  const { data: inserted, error } = await serviceClient
    .from("place_submissions")
    .insert({
      user_id: userId,
      place_name,
      address_or_location,
      place_type,
      submitted_from_search,
      submitter_full_name: submitterFullName,
      submitter_email: submitterEmail,
      source: "user_form",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to submit place" },
      { status: 500 },
    );
  }

  // Attempt Google Places match and back-fill the submission row.
  // Wrapped in try/catch so any Google API failure does not block the user-facing response.
  // match_confidence stays null if the call fails or GOOGLE_PLACES_API_KEY is unset.
  if (GOOGLE_PLACES_API_KEY && inserted?.id) {
    try {
      const match = await matchGooglePlace(place_name, address_or_location);
      await serviceClient
        .from("place_submissions")
        .update({
          google_place_id: match.googlePlaceId,
          google_match_name: match.googleMatchName,
          google_match_address: match.googleMatchAddress,
          match_confidence: match.matchConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    } catch {
      console.error("[place-submissions] Google Places match failed");
    }
  }

  return NextResponse.json({ ok: true });
}
