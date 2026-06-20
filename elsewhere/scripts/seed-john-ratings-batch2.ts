/**
 * Batch-2 seed for John (8c126980-be4f-4c8d-b052-d66ed1be4adc).
 *
 * Phase 1 — ensure all 8 target places exist in `places`:
 *   Known places (google_place_id already in DB): confirmed by direct
 *   google_place_id lookup; logged but not touched.
 *   Unknown places (Lake Anne, Qamaria Sterling): found via Google Text
 *   Search, upserted via the same mapPlaceToRow path used by
 *   approve-and-seed.ts, then photos seeded immediately.
 *
 * Phase 2 — seed 7 ratings for John across these places.
 *   Place resolution uses a seedKey → place_id map built in Phase 1,
 *   bypassing name-based lookup entirely — this avoids the Weird Brothers
 *   ambiguity (two rows with name "Weird Brothers Coffee") and the
 *   De Clieu Reston vs. Fairfax ambiguity.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-john-ratings-batch2.ts --dry-run
 *   npx ts-node scripts/seed-john-ratings-batch2.ts
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import {
  type PlaceType,
  type NoiseLevel,
  type VibeLevel,
  type TablesLabel,
  type OutletsLabel,
  fetchPlaceDetails,
  inferPlaceType,
  mapPlaceToRow,
  searchTextPlaces,
  seedPhotosForPlace,
  normalizeNoise,
  normalizeVibe,
  normalizeTables,
  normalizeOutlets,
} from "../lib/seedHelpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const USER_ID = "8c126980-be4f-4c8d-b052-d66ed1be4adc";

function argvFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── Target places ─────────────────────────────────────────────────────────────
//
// seedKey is the stable identifier used throughout this script.
// seedRating: false means we check existence but do not seed a rating.
//
// Known places carry the google_place_id already stored in the DB — confirmed
// by a direct DB lookup; no Google API call needed unless the row is somehow
// missing (shouldn't happen).
//
// Unknown places carry a searchQuery — the script will text-search Google,
// confirm the result by address, duplicate-check the DB, and create if absent.

type KnownPlace = {
  seedKey: string;
  label: string;
  googlePlaceId: string;
  type: PlaceType;
  seedRating: boolean;
};

type SearchPlace = {
  seedKey: string;
  label: string;
  searchQuery: string;
  type: PlaceType;
  seedRating: boolean;
};

type TargetPlace = KnownPlace | SearchPlace;

const TARGET_PLACES: TargetPlace[] = [
  {
    seedKey: "Le Vingt Trois",
    label: "Le Vingt Trois (Reston, VA)",
    googlePlaceId: "ChIJx8x9byJJtokRMBaaz59THfw",
    type: "cafe",
    seedRating: true,
  },
  {
    seedKey: "Lake Anne Coffee House",
    label: "Lake Anne Coffee House & Wine Bar (Reston, VA)",
    searchQuery: "Lake Anne Coffee House Wine Bar Reston VA",
    type: "cafe",
    seedRating: true,
  },
  {
    seedKey: "Weird Brothers Worldgate",
    label: "Weird Brothers Coffee — Worldgate (Herndon, VA)",
    googlePlaceId: "ChIJQabxkb5HtokRW9s63wc5dCY",
    type: "cafe",
    seedRating: true,
  },
  {
    // Exist-check only — no rating for this location in this batch.
    seedKey: "Simply Social Vienna",
    label: "Simply Social Coffee (Vienna, VA)",
    googlePlaceId: "ChIJRxlxH05LtokRtZ8UXXXYG-A",
    type: "cafe",
    seedRating: false,
  },
  {
    seedKey: "Simply Social Reston",
    label: "Simply Social Coffee (Reston, VA — Sunrise Valley Dr)",
    googlePlaceId: "ChIJX6zmCDhJtokR9FlxyUBo5Jg",
    type: "cafe",
    seedRating: true,
  },
  {
    seedKey: "Qamaria Vienna",
    label: "Qamaria Yemeni Coffee (Vienna, VA)",
    googlePlaceId: "ChIJsY_77eJLtokRPs5ZvVOXgTM",
    type: "cafe",
    seedRating: true,
  },
  {
    seedKey: "Qamaria Sterling",
    label: "Qamaria Yemeni Coffee (Sterling, VA — Shoppes at Potomac Corner)",
    searchQuery: "Qamaria Yemeni Coffee Sterling VA",
    type: "cafe",
    seedRating: true,
  },
  {
    // Must resolve to the Reston/Soapstone location — NOT the Fairfax row
    // (id: 573b648a, google_place_id: ChIJXRjFSZJOtokRDouo_quteDk).
    seedKey: "De Clieu Reston",
    label: "De Clieu Coffee & Sandwich (Reston, VA — Soapstone Dr)",
    googlePlaceId: "ChIJV39HOQBJtokRtmM0ztATMLs",
    type: "cafe",
    seedRating: true,
  },
];

// ── Ratings ───────────────────────────────────────────────────────────────────
//
// Two Qamaria entries (Vienna + Sterling) are included because both locations
// exist after Phase 1. The seedKey maps each directly to the correct place_id
// in resolvedIds, avoiding any name-collision ambiguity.

interface RatingInput {
  seedKey: string;
  placeName: string;
  overall_rating: number;
  noise: string;
  vibe: string;
  outlets: string;
  tables: string;
  notes: string;
}

const RATINGS_INPUT: RatingInput[] = [
  {
    seedKey: "Le Vingt Trois",
    placeName: "Le Vingt Trois",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "really nice french cafe vibe, decent amount of seating too. good spot if you want something that doesn't feel like every other coffee shop",
  },
  {
    seedKey: "Lake Anne Coffee House",
    placeName: "Lake Anne Coffee House",
    overall_rating: 4.0,
    noise: "silent",
    vibe: "focused",
    outlets: "moderate",
    tables: "moderate",
    notes:
      "upstairs is quiet and great for actually getting stuff done. patio out back is gorgeous too if you need a break between calls",
  },
  {
    seedKey: "Weird Brothers Worldgate",
    placeName: "Weird Brothers Coffee (Worldgate)",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "worldgate location has a genuinely spacious and comfy seating area, even the owner says it's built for working. quirky vibe but in a good way",
  },
  {
    // Task: "Simply Social Coffee" → must resolve to Reston, not Vienna or Fairfax.
    seedKey: "Simply Social Reston",
    placeName: "Simply Social Coffee (Reston)",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "vienna location has real tables and solid wifi, not dead silent but not overwhelming either. good middle ground for working",
  },
  {
    seedKey: "Qamaria Vienna",
    placeName: "Qamaria Yemeni Coffee (Vienna)",
    overall_rating: 4.5,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "spacious interior with actual tables, feels like a destination instead of just a quick coffee run. good vibe if you want your work session to feel a little more intentional",
  },
  {
    seedKey: "Qamaria Sterling",
    placeName: "Qamaria Yemeni Coffee (Sterling)",
    overall_rating: 4.5,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "same great atmosphere as the vienna location, worth going out of your way for. seating is solid and it doesn't feel like a chain even though it's not the original spot",
  },
  {
    // Task: "De Clieu Coffee" → must resolve to Reston (Soapstone), not Fairfax.
    seedKey: "De Clieu Reston",
    placeName: "De Clieu Coffee (Reston — Soapstone)",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "soapstone location is bright and modern, layout makes you want to actually stay a while. full breakfast and lunch menu so you're not stuck leaving to find food mid work session",
  },
];

// ── Rating row shape ──────────────────────────────────────────────────────────

interface RatingRow {
  place_id: string;
  user_id: string;
  overall_rating: number;
  noise: NoiseLevel;
  vibe: VibeLevel;
  tables: TablesLabel;
  outlets: OutletsLabel;
  notes: string;
  photo_paths: string[];
  photo_path: null;
  is_hidden: boolean;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = argvFlag("--dry-run");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  if (!GOOGLE_PLACES_API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env.local");
    process.exit(1);
  }

  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`User: ${USER_ID}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Phase 1: Resolve / create places ──────────────────────────────────────

  console.log("=== Phase 1: Place resolution ===\n");

  // seedKey → place_id (populated during this phase, used in Phase 2).
  const resolvedIds = new Map<string, string>();
  const createdSeedKeys: string[] = [];

  for (const target of TARGET_PLACES) {
    let googlePlaceId: string;

    if ("googlePlaceId" in target) {
      googlePlaceId = target.googlePlaceId;
    } else {
      // Unknown place — text-search Google for the google_place_id.
      console.log(`Searching Google: "${target.searchQuery}"`);
      let searchResult: Awaited<ReturnType<typeof searchTextPlaces>>;
      try {
        searchResult = await searchTextPlaces(target.searchQuery, GOOGLE_PLACES_API_KEY);
      } catch (e) {
        console.error(
          `  ✗ Text search failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      if (!searchResult) {
        console.error(`  ✗ No Google result for "${target.label}". Skipping.`);
        continue;
      }

      console.log(`  Top result: "${searchResult.displayName}" — ${searchResult.formattedAddress}`);
      googlePlaceId = searchResult.id;
    }

    // Duplicate guard: check DB by google_place_id.
    const { data: existing, error: lookupError } = await supabase
      .from("places")
      .select("id, name")
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();

    if (lookupError) {
      console.error(`  ✗ DB lookup failed: ${lookupError.message}`);
      continue;
    }

    if (existing) {
      console.log(`"${target.label}" — already exists (id: ${existing.id as string})`);
      resolvedIds.set(target.seedKey, existing.id as string);
      continue;
    }

    // Not in DB — fetch full details and create.
    console.log(`  Not found in DB. Fetching full Google details...`);
    let details: Awaited<ReturnType<typeof fetchPlaceDetails>>;
    try {
      details = await fetchPlaceDetails(googlePlaceId, GOOGLE_PLACES_API_KEY);
    } catch (e) {
      console.error(`  ✗ Google API error: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const placeType: PlaceType =
      target.type ?? inferPlaceType(details.primaryType);

    let placeRow: ReturnType<typeof mapPlaceToRow>;
    try {
      placeRow = mapPlaceToRow(details, placeType);
    } catch (e) {
      console.error(
        `  ✗ Could not build place row: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    console.log(`  Name:    ${placeRow.name}`);
    console.log(`  Address: ${placeRow.address}`);
    console.log(`  Coords:  ${placeRow.lat}, ${placeRow.lng}`);
    console.log(`  Type:    ${placeRow.place_type}`);

    if (isDryRun) {
      console.log(`"${target.label}" — would be created (dry run — no write)`);
      continue;
    }

    const { data: upserted, error: upsertError } = await supabase
      .from("places")
      .upsert([placeRow], { onConflict: "google_place_id" })
      .select("id")
      .single();

    if (upsertError) {
      console.error(`  ✗ Insert failed: ${upsertError.message}`);
      continue;
    }

    const newPlaceId = upserted.id as string;
    console.log(`"${target.label}" — created (id: ${newPlaceId})`);
    resolvedIds.set(target.seedKey, newPlaceId);
    createdSeedKeys.push(target.seedKey);

    // Seed photos immediately after creation.
    console.log(`  Seeding photos...`);
    try {
      const photoCount = await seedPhotosForPlace(
        supabase,
        newPlaceId,
        placeRow.name,
        placeRow.google_place_id,
        GOOGLE_PLACES_API_KEY,
        SUPABASE_URL,
      );
      console.log(`  ${photoCount} photo(s) uploaded.`);
    } catch (e) {
      console.error(
        `  Photo seeding failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    console.log();
  }

  console.log();

  // ── Phase 2: Seed ratings ──────────────────────────────────────────────────

  console.log("=== Phase 2: Rating seeding ===\n");

  // Only check for existing ratings against places we actually resolved.
  const allResolvedIds = [...resolvedIds.values()];

  const { data: existingRatings, error: existingError } = await supabase
    .from("ratings")
    .select("place_id")
    .eq("user_id", USER_ID)
    .in(
      "place_id",
      allResolvedIds.length > 0
        ? allResolvedIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (existingError) {
    console.error("Failed to query existing ratings:", existingError.message);
    process.exit(1);
  }

  const existingPlaceIds = new Set((existingRatings ?? []).map((r) => r.place_id));

  const toInsert: RatingRow[] = [];
  let alreadyExistsCount = 0;
  let skippedNoPlace = 0;

  for (const input of RATINGS_INPUT) {
    const placeId = resolvedIds.get(input.seedKey);
    if (!placeId) {
      console.log(
        `SKIPPED: "${input.placeName}" — place not resolved (may not have been created yet)`,
      );
      skippedNoPlace++;
      continue;
    }

    if (existingPlaceIds.has(placeId)) {
      console.log(`SKIPPED: "${input.placeName}" — rating already exists`);
      alreadyExistsCount++;
      continue;
    }

    const row: RatingRow = {
      place_id: placeId,
      user_id: USER_ID,
      overall_rating: input.overall_rating,
      noise: normalizeNoise(input.noise),
      vibe: normalizeVibe(input.vibe),
      tables: normalizeTables(input.tables),
      outlets: normalizeOutlets(input.outlets),
      notes: input.notes,
      photo_paths: [],
      photo_path: null,
      is_hidden: false,
    };

    toInsert.push(row);
  }

  if (isDryRun) {
    console.log("=== DRY RUN: rows that would be inserted ===\n");
    for (const row of toInsert) {
      const ratingInput = RATINGS_INPUT.find(
        (r) => resolvedIds.get(r.seedKey) === row.place_id,
      );
      console.log(`// ${ratingInput?.placeName ?? row.place_id}`);
      console.log(JSON.stringify(row, null, 2));
      console.log();
    }
  } else {
    if (toInsert.length === 0) {
      console.log("Nothing to insert.");
    } else {
      console.log(`Inserting ${toInsert.length} rating(s)...`);
      const { error: insertError } = await supabase.from("ratings").insert(toInsert);
      if (insertError) {
        console.error("Insert failed:", insertError.message);
        process.exit(1);
      }
      console.log("Insert successful.");
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n=== Seed Summary ===");
  console.log(`Places resolved:          ${resolvedIds.size} / ${TARGET_PLACES.length}`);
  console.log(`Places created:           ${isDryRun ? "(dry run)" : createdSeedKeys.length}`);
  if (createdSeedKeys.length > 0) {
    for (const key of createdSeedKeys) console.log(`  - ${key} (id: ${resolvedIds.get(key)})`);
  }
  console.log(
    `${isDryRun ? "Would insert" : "Inserted"}:          ${toInsert.length} rating(s)`,
  );
  console.log(`Skipped (already exists): ${alreadyExistsCount}`);
  console.log(`Skipped (place missing):  ${skippedNoPlace}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
