/**
 * General-purpose seed script — turns a JSON ratings file into DB rows for a target user.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-ratings-from-source.ts --file scripts/data/some-ratings.json --user-id {uuid}
 *   npx ts-node scripts/seed-ratings-from-source.ts --file scripts/data/some-ratings.json --user-id {uuid} --dry-run
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * JSON file shape:
 *   [{ place_name, overall_rating, noise, vibe, outlets, tables, notes }]
 *
 * Enum aliases (same as seed-nova-ratings.ts):
 *   noise:   moderate → quiet  |  loud → vibrant
 *   vibe:    cozy → casual
 *   outlets: moderate → some
 *   tables:  scarce → limited
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import dotenv from "dotenv";
import path from "path";
import {
  type NoiseLevel,
  type VibeLevel,
  type TablesLabel,
  type OutletsLabel,
  NAME_OVERRIDES,
  normalizeNoise,
  normalizeVibe,
  normalizeTables,
  normalizeOutlets,
} from "../lib/seedHelpers";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── CLI helpers ───────────────────────────────────────────────────────────────

function argvValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function argvFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── Input schema ──────────────────────────────────────────────────────────────

interface RatingInput {
  place_name: string;
  overall_rating: number;
  noise: string;
  vibe: string;
  outlets: string;
  tables: string;
  notes: string;
}

function isRatingInput(v: unknown): v is RatingInput {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.place_name === "string" &&
    typeof o.overall_rating === "number" &&
    typeof o.noise === "string" &&
    typeof o.vibe === "string" &&
    typeof o.outlets === "string" &&
    typeof o.tables === "string" &&
    typeof o.notes === "string"
  );
}

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
  const filePath = argvValue("--file");
  const userId = argvValue("--user-id");

  if (!filePath || !userId) {
    console.error(
      "Usage: npx ts-node scripts/seed-ratings-from-source.ts --file <path> --user-id <uuid> [--dry-run]",
    );
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  // Load and validate JSON -------------------------------------------------------

  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } catch (e) {
    console.error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (!Array.isArray(rawJson)) {
    console.error("JSON file must contain an array of rating objects.");
    process.exit(1);
  }

  const parseErrors: string[] = [];
  const ratingsInput: RatingInput[] = [];
  for (let i = 0; i < rawJson.length; i++) {
    if (!isRatingInput(rawJson[i])) {
      parseErrors.push(`Entry ${i}: missing or wrong-typed fields (need place_name, overall_rating, noise, vibe, outlets, tables, notes)`);
    } else {
      ratingsInput.push(rawJson[i] as RatingInput);
    }
  }
  if (parseErrors.length > 0) {
    for (const e of parseErrors) console.error(e);
    process.exit(1);
  }

  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "LIVE INSERT"}`);
  console.log(`User: ${userId}`);
  console.log(`File: ${absPath}`);
  console.log(`Entries: ${ratingsInput.length}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Step 1: resolve place IDs -----------------------------------------------

  const { data: places, error: placesError } = await supabase
    .from("places")
    .select("id, name")
    .eq("is_active", true);

  if (placesError) {
    console.error("Failed to query places:", placesError.message);
    process.exit(1);
  }

  const placeMap = new Map<string, string>(); // lower-name → id
  for (const p of places ?? []) {
    placeMap.set(p.name.toLowerCase(), p.id);
  }

  const flagged: string[] = [];
  const resolved = new Map<string, string>(); // place_name → place_id

  for (const { place_name } of ratingsInput) {
    if (resolved.has(place_name)) continue; // dedupe in case same name appears twice
    const lookupName = NAME_OVERRIDES[place_name] ?? place_name;
    const id = placeMap.get(lookupName.toLowerCase());
    if (id) {
      resolved.set(place_name, id);
    } else {
      console.log(`FLAGGED: "${place_name}" not found in places table -- skipping`);
      flagged.push(place_name);
    }
  }

  // Step 2: duplicate guard --------------------------------------------------

  const placeIds = [...resolved.values()];

  const { data: existingRatings, error: existingError } = await supabase
    .from("ratings")
    .select("place_id")
    .eq("user_id", userId)
    .in("place_id", placeIds.length > 0 ? placeIds : ["00000000-0000-0000-0000-000000000000"]);

  if (existingError) {
    console.error("Failed to query existing ratings:", existingError.message);
    process.exit(1);
  }

  const existingPlaceIds = new Set((existingRatings ?? []).map((r) => r.place_id));

  // Step 3: build rows -------------------------------------------------------

  const toInsert: RatingRow[] = [];
  let alreadyExistsCount = 0;

  for (const input of ratingsInput) {
    const placeId = resolved.get(input.place_name);
    if (!placeId) continue; // flagged

    if (existingPlaceIds.has(placeId)) {
      console.log(`SKIPPING: rating already exists for "${input.place_name}"`);
      alreadyExistsCount++;
      continue;
    }

    const row: RatingRow = {
      place_id: placeId,
      user_id: userId,
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

  // Step 4: dry run or insert ------------------------------------------------

  if (isDryRun) {
    console.log("\n=== DRY RUN: rows that would be inserted ===\n");
    for (const row of toInsert) {
      const placeName = [...resolved.entries()].find(([, id]) => id === row.place_id)?.[0];
      console.log(`// ${placeName}`);
      console.log(JSON.stringify(row, null, 2));
      console.log();
    }
  } else {
    if (toInsert.length === 0) {
      console.log("\nNothing to insert.");
    } else {
      console.log(`\nInserting ${toInsert.length} rating(s)...`);
      const { error: insertError } = await supabase.from("ratings").insert(toInsert);
      if (insertError) {
        console.error("Insert failed:", insertError.message);
        process.exit(1);
      }
      console.log("Insert successful.");
    }
  }

  // Step 5: summary ----------------------------------------------------------

  console.log("\n=== Seed Summary ===");
  console.log(
    `${isDryRun ? "Would insert" : "Inserted"}:          ${toInsert.length}`,
  );
  console.log(`Skipped (already exists): ${alreadyExistsCount}`);
  console.log(`Flagged (not in places):  ${flagged.length}`);
  if (flagged.length > 0) {
    console.log(`Flagged places: ${flagged.map((n) => `"${n}"`).join(", ")}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
