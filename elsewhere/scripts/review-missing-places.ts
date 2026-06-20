/**
 * Review place_submissions (status = 'new') and approve, reject, or flag for investigation.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/review-missing-places.ts
 *   npx ts-node scripts/review-missing-places.ts --approve {id} [--place-id {google_place_id}] [--type cafe|library|bookstore|tea_shop]
 *   npx ts-node scripts/review-missing-places.ts --reject {id} [--notes "reason"]
 *   npx ts-node scripts/review-missing-places.ts --reviewing {id}
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *                   GOOGLE_PLACES_API_KEY  (required for --approve)
 *
 * Status flow:
 *   new → reviewing → added | rejected
 *
 * --approve uses the submission's google_place_id to upsert into places.
 * If the submission has no google_place_id (match_confidence = 'none' or null),
 * supply one manually with --place-id.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "photos",
  "currentOpeningHours",
  "primaryType",
].join(",");

type PlaceType = "cafe" | "library" | "bookstore" | "tea_shop";
const VALID_PLACE_TYPES = new Set<string>(["cafe", "library", "bookstore", "tea_shop"]);

// ── CLI helpers ───────────────────────────────────────────────────────────────

function argvValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function argvFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── Google Places helpers (mirrors seed-places.ts — cannot import it directly) ──

interface PlaceResource {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: { name?: string }[];
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: unknown[];
  };
  primaryType?: string;
}

async function fetchPlaceDetails(googlePlaceId: string): Promise<PlaceResource> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is required in .env.local for --approve");
  }
  const id = googlePlaceId.startsWith("places/")
    ? googlePlaceId.slice("places/".length)
    : googlePlaceId;

  const res = await fetch(`${PLACE_DETAILS_URL}/${encodeURIComponent(id)}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PlaceResource>;
}

function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

function inferPlaceType(primaryType?: string): PlaceType {
  if (!primaryType) return "cafe";
  const t = primaryType.toLowerCase();
  if (t.includes("library")) return "library";
  if (t.includes("book_store") || t.includes("bookstore")) return "bookstore";
  if (t.includes("tea")) return "tea_shop";
  return "cafe";
}

function mapPlaceToRow(place: PlaceResource, placeType: PlaceType) {
  const googlePlaceId = (place.id ?? place.name)?.trim();
  if (!googlePlaceId) throw new Error("Google place has no id");

  const latRaw = place.location?.latitude;
  const lngRaw = place.location?.longitude;
  if (latRaw == null || lngRaw == null) {
    throw new Error("Google place has no coordinates");
  }

  const name = (place.displayName?.text ?? "Unknown").trim() || "Unknown";
  const address = (place.formattedAddress ?? "").trim() || "Address unknown";

  const rawPhoto = place.photos?.[0]?.name?.trim();
  const googlePhotoRef = rawPhoto ? rawPhoto.replace(/\/media$/, "") : null;

  const openingHours = place.currentOpeningHours
    ? {
        open_now: place.currentOpeningHours.openNow ?? null,
        weekday_descriptions: place.currentOpeningHours.weekdayDescriptions ?? null,
        periods: place.currentOpeningHours.periods ?? null,
      }
    : null;

  return {
    google_place_id: googlePlaceId,
    name,
    address,
    lat: roundCoord7(latRaw),
    lng: roundCoord7(lngRaw),
    place_type: placeType,
    google_photo_ref: googlePhotoRef,
    opening_hours: openingHours,
    has_wifi: null,
    is_active: true,
    created_by: null,
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function listNew() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("place_submissions")
    .select(
      "id, place_name, address_or_location, google_match_name, google_match_address, match_confidence, submitted_from_search, submitter_full_name, created_at",
    )
    .eq("status", "new")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to query submissions:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("No submissions with status 'new'.");
    return;
  }

  console.log(`${rows.length} submission(s) with status 'new':\n`);
  for (const row of rows) {
    console.log(`ID:               ${row.id}`);
    console.log(`Place name:       ${row.place_name}`);
    console.log(`Address:          ${row.address_or_location}`);
    console.log(`Google match:     ${row.google_match_name ?? "(none)"}`);
    console.log(`Google address:   ${row.google_match_address ?? "(none)"}`);
    console.log(`Confidence:       ${row.match_confidence ?? "(not matched)"}`);
    console.log(`From search:      ${row.submitted_from_search ?? "(none)"}`);
    console.log(`Submitted by:     ${row.submitter_full_name ?? "(anonymous)"}`);
    console.log(`Created:          ${row.created_at}`);
    console.log();
  }

  console.log("Actions:");
  console.log("  --approve {id} [--place-id {google_id}] [--type cafe|library|bookstore|tea_shop]");
  console.log("  --reject {id} [--notes \"reason\"]");
  console.log("  --reviewing {id}");
}

async function approveSubmission(
  submissionId: string,
  placeIdOverride: string | undefined,
  typeOverride: string | undefined,
) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: submission, error: fetchError } = await supabase
    .from("place_submissions")
    .select("id, place_name, place_type, google_place_id, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch submission:", fetchError.message);
    process.exit(1);
  }

  if (!submission) {
    console.error(`Submission ${submissionId} not found.`);
    process.exit(1);
  }

  if (submission.status === "added") {
    console.error(`Submission "${submission.place_name}" is already added.`);
    process.exit(1);
  }

  const googlePlaceId: string = placeIdOverride?.trim() || submission.google_place_id;

  if (!googlePlaceId) {
    console.error(
      `Submission "${submission.place_name}" has no google_place_id.\n` +
        `Supply one manually: --approve ${submissionId} --place-id {google_place_id}`,
    );
    process.exit(1);
  }

  // Resolve place type: explicit flag → submission type (if valid) → infer from Google.
  let placeType: PlaceType;
  if (typeOverride) {
    if (!VALID_PLACE_TYPES.has(typeOverride)) {
      console.error(
        `Invalid --type "${typeOverride}". Valid values: cafe, library, bookstore, tea_shop`,
      );
      process.exit(1);
    }
    placeType = typeOverride as PlaceType;
  } else if (VALID_PLACE_TYPES.has(submission.place_type ?? "")) {
    placeType = submission.place_type as PlaceType;
  } else {
    // Submission type is not a valid places enum value (e.g. 'coworking', 'bar').
    // Fetch place details to infer from Google's primaryType.
    placeType = "cafe"; // will be overwritten below after fetch
  }

  console.log(`Fetching Google place details for ${googlePlaceId}...`);
  let details: PlaceResource;
  try {
    details = await fetchPlaceDetails(googlePlaceId);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  // Resolve place type from Google if we couldn't get it from the submission.
  if (!typeOverride && !VALID_PLACE_TYPES.has(submission.place_type ?? "")) {
    placeType = inferPlaceType(details.primaryType);
    console.log(
      `Submission type "${submission.place_type}" is not a valid places enum value.\n` +
        `Inferred from Google primaryType ("${details.primaryType ?? "none"}"): ${placeType}\n` +
        `Override with --type cafe|library|bookstore|tea_shop if incorrect.\n`,
    );
  }

  let placeRow: ReturnType<typeof mapPlaceToRow>;
  try {
    placeRow = mapPlaceToRow(details, placeType);
  } catch (e) {
    console.error("Could not build place row:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  console.log("Resolved place:");
  console.log(`  Name:            ${placeRow.name}`);
  console.log(`  Address:         ${placeRow.address}`);
  console.log(`  Google Place ID: ${placeRow.google_place_id}`);
  console.log(`  Coordinates:     ${placeRow.lat}, ${placeRow.lng}`);
  console.log(`  Type:            ${placeRow.place_type}`);
  console.log(`  Photo ref:       ${placeRow.google_photo_ref ?? "(none)"}`);
  console.log();

  const { error: upsertError } = await supabase
    .from("places")
    .upsert([placeRow], { onConflict: "google_place_id" });

  if (upsertError) {
    console.error("Failed to upsert place:", upsertError.message);
    process.exit(1);
  }

  console.log(`Upserted "${placeRow.name}" into places.`);

  const { error: updateError } = await supabase
    .from("place_submissions")
    .update({ status: "added", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (updateError) {
    console.error(
      "Place upserted but failed to update submission status:",
      updateError.message,
    );
    process.exit(1);
  }

  console.log(`Submission ${submissionId} marked as 'added'.`);
}

async function rejectSubmission(submissionId: string, notes: string | undefined) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: submission, error: fetchError } = await supabase
    .from("place_submissions")
    .select("id, place_name, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch submission:", fetchError.message);
    process.exit(1);
  }

  if (!submission) {
    console.error(`Submission ${submissionId} not found.`);
    process.exit(1);
  }

  if (submission.status === "rejected") {
    console.error(`Submission "${submission.place_name}" is already rejected.`);
    process.exit(1);
  }

  const update: Record<string, unknown> = {
    status: "rejected",
    updated_at: new Date().toISOString(),
  };
  if (notes) update.reviewer_notes = notes;

  const { error: updateError } = await supabase
    .from("place_submissions")
    .update(update)
    .eq("id", submissionId);

  if (updateError) {
    console.error("Failed to reject submission:", updateError.message);
    process.exit(1);
  }

  console.log(`Submission "${submission.place_name}" (${submissionId}) marked as 'rejected'.`);
  if (notes) console.log(`Notes: ${notes}`);
}

async function markReviewing(submissionId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: submission, error: fetchError } = await supabase
    .from("place_submissions")
    .select("id, place_name, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch submission:", fetchError.message);
    process.exit(1);
  }

  if (!submission) {
    console.error(`Submission ${submissionId} not found.`);
    process.exit(1);
  }

  const { error: updateError } = await supabase
    .from("place_submissions")
    .update({ status: "reviewing", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (updateError) {
    console.error("Failed to update submission:", updateError.message);
    process.exit(1);
  }

  console.log(`Submission "${submission.place_name}" (${submissionId}) marked as 'reviewing'.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const approveId = argvValue("--approve");
  const rejectId = argvValue("--reject");
  const reviewingId = argvValue("--reviewing");
  const placeIdOverride = argvValue("--place-id");
  const typeOverride = argvValue("--type");
  const notes = argvValue("--notes");

  const actions = [approveId, rejectId, reviewingId].filter(Boolean).length;
  if (actions > 1) {
    console.error("Specify only one of --approve, --reject, or --reviewing.");
    process.exit(1);
  }

  if (approveId) {
    await approveSubmission(approveId, placeIdOverride, typeOverride);
    return;
  }

  if (rejectId) {
    await rejectSubmission(rejectId, notes);
    return;
  }

  if (reviewingId) {
    await markReviewing(reviewingId);
    return;
  }

  await listNew();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
