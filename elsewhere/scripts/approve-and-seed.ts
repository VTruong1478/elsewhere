/**
 * Approve a place submission and immediately seed its photos in one command.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/approve-and-seed.ts {submission_id} [--type cafe|library|bookstore|tea_shop]
 *   npx ts-node scripts/approve-and-seed.ts {submission_id} --place-id {google_place_id}
 *
 * The submission must have status 'new' or 'reviewing'. Rejection happens directly
 * in Supabase — this script only handles the approve + seed path.
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import {
  type PlaceType,
  VALID_PLACE_TYPES,
  fetchPlaceDetails,
  inferPlaceType,
  mapPlaceToRow,
  seedPhotosForPlace,
} from "../lib/seedHelpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

function argvValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const submissionId = process.argv[2];
  const placeIdOverride = argvValue("--place-id");
  const typeOverride = argvValue("--type");

  if (!submissionId || submissionId.startsWith("--")) {
    console.error(
      "Usage: npx ts-node scripts/approve-and-seed.ts {submission_id} [--place-id {google_id}] [--type cafe|library|bookstore|tea_shop]",
    );
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  if (!GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is required in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── 1. Fetch submission ───────────────────────────────────────────────────

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

  if (submission.status !== "new" && submission.status !== "reviewing") {
    console.error(
      `Submission status is "${submission.status}" — only 'new' or 'reviewing' can be approved here.`,
    );
    process.exit(1);
  }

  // ── 2. Resolve google_place_id ────────────────────────────────────────────

  const googlePlaceId: string = placeIdOverride?.trim() || submission.google_place_id;

  if (!googlePlaceId) {
    console.error(
      `Submission "${submission.place_name}" has no google_place_id.\n` +
        `Supply one manually: npx ts-node scripts/approve-and-seed.ts ${submissionId} --place-id {google_place_id}`,
    );
    process.exit(1);
  }

  // ── 3. Fetch Google place details ─────────────────────────────────────────

  console.log(`Fetching Google place details for ${googlePlaceId}...`);
  let details: Awaited<ReturnType<typeof fetchPlaceDetails>>;
  try {
    details = await fetchPlaceDetails(googlePlaceId, GOOGLE_PLACES_API_KEY);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  // ── 4. Resolve place type ─────────────────────────────────────────────────

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
    placeType = inferPlaceType(details.primaryType);
    console.log(
      `Submission type "${submission.place_type}" is not a valid places enum value.\n` +
        `Inferred from Google primaryType ("${details.primaryType ?? "none"}"): ${placeType}\n` +
        `Override with --type cafe|library|bookstore|tea_shop if incorrect.\n`,
    );
  }

  // ── 5. Build and upsert place row ─────────────────────────────────────────

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
  console.log();

  // ── 5a. Duplicate guard ───────────────────────────────────────────────────

  const { data: existingPlace } = await supabase
    .from("places")
    .select("id, name")
    .eq("google_place_id", placeRow.google_place_id)
    .maybeSingle();

  if (existingPlace) {
    console.log(`\n⚠ Place already exists: "${existingPlace.name}" (id: ${existingPlace.id})`);
    console.log("No new place created. Submission marked as already added.\n");
    await supabase
      .from("place_submissions")
      .update({ status: "added", updated_at: new Date().toISOString() })
      .eq("id", submissionId);
    return;
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("places")
    .upsert([placeRow], { onConflict: "google_place_id" })
    .select("id")
    .single();

  if (upsertError) {
    console.error("Failed to upsert place:", upsertError.message);
    process.exit(1);
  }

  const newPlaceId = upserted.id as string;

  // ── 6. Update submission status ───────────────────────────────────────────

  const { error: updateError } = await supabase
    .from("place_submissions")
    .update({ status: "added", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (updateError) {
    console.error("Place upserted but failed to update submission status:", updateError.message);
    process.exit(1);
  }

  console.log(`✓ Place approved and created`);
  console.log(`  Place ID: ${newPlaceId}`);
  console.log(`  Name:     ${placeRow.name}`);
  console.log();

  // ── 7. Seed photos ────────────────────────────────────────────────────────

  console.log("Seeding photos...");
  let photoCount = 0;
  try {
    photoCount = await seedPhotosForPlace(
      supabase,
      newPlaceId,
      placeRow.name,
      placeRow.google_place_id,
      GOOGLE_PLACES_API_KEY,
      SUPABASE_URL,
    );
  } catch (e) {
    console.error("Photo seeding failed:", e instanceof Error ? e.message : String(e));
    console.log(`Run manually: npx ts-node scripts/seed-place-photos.ts --place-id ${newPlaceId}`);
    process.exit(1);
  }

  console.log();
  console.log(`✓ Photos seeded`);
  console.log(`  ${photoCount} photo(s) uploaded`);
  console.log();
  console.log("Next step — review photos:");
  console.log("Open dev-tools/photo-review.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
