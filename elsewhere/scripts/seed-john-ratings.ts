/**
 * Seed ratings for John (8c126980-be4f-4c8d-b052-d66ed1be4adc).
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-john-ratings.ts
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
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

const USER_ID = "8c126980-be4f-4c8d-b052-d66ed1be4adc";

// Local overrides for names not in the shared NAME_OVERRIDES.
const LOCAL_NAME_OVERRIDES: Record<string, string> = {
  "Northside Social": "Northside Social Falls Church",
  "Jireh Bakery & Cafe": "Jireh Bakery Cafe",
};

// Merged lookup: local overrides take precedence.
const ALL_NAME_OVERRIDES: Record<string, string> = {
  ...NAME_OVERRIDES,
  ...LOCAL_NAME_OVERRIDES,
};

// ── Input data ────────────────────────────────────────────────────────────────

interface RatingInput {
  place_name: string;
  overall_rating: number;
  noise: string;
  vibe: string;
  outlets: string;
  tables: string;
  notes: string;
}

const RATINGS_INPUT: RatingInput[] = [
  {
    place_name: "Caboose Commons",
    overall_rating: 4.5,
    noise: "moderate",
    vibe: "focused",
    outlets: "ample",
    tables: "plentiful",
    notes:
      "honestly one of the best spots to get work done -- huge space and you order through a qr code so no one's hovering over you. 2nd floor is the move, way less foot traffic",
  },
  {
    place_name: "Northside Social",
    overall_rating: 3.5,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "lots of seating but not the most comfortable for long sessions. go to the back corner past the counter if you want something quieter, way better than sitting up front",
  },
  {
    place_name: "Basecamp Coffee Roasters",
    overall_rating: 4.0,
    noise: "silent",
    vibe: "focused",
    outlets: "ample",
    tables: "limited",
    notes:
      "best outlets in the area no question. seating fills up fast tho so get there early or you're not getting a spot",
  },
  {
    place_name: "Kaldi's Social House",
    overall_rating: 4.5,
    noise: "moderate",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "always see people working or studying here which is the vibe i need. opens early closes late, lighting is chill not too bright, comfy seats -- checks all the boxes",
  },
  {
    place_name: "Jireh Bakery & Cafe",
    overall_rating: 4.5,
    noise: "silent",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "upstairs is lowkey a hidden gem -- tons of seating and always see people getting work done up there. great natural light too which makes a difference",
  },
  {
    place_name: "Foundation Coffee",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "focused",
    outlets: "ample",
    tables: "plentiful",
    notes:
      "space is really solid and outlets everywhere but the wifi cuts out constantly which is annoying if you need to be online. also on the pricier side but the vibe makes up for it when it's not too packed",
  },
  {
    place_name: "Goosecup",
    overall_rating: 3.5,
    noise: "loud",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "inside gets loud but the patio is genuinely beautiful if the weather is good -- way better experience outside than in",
  },
  {
    place_name: "Chateau de Chantilly",
    overall_rating: 2.5,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes:
      "they have a 90 min limit sign but i've never seen them actually enforce it. feels super cluttered and cramped inside tho, not the move if you're trying to actually focus",
  },
  {
    place_name: "Cafe V",
    overall_rating: 3.5,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "limited",
    notes:
      "solid spot for getting a few hours of work in, seen a lot of people recommend it and i get why. can get loud but manageable if you go at the right time",
  },
  {
    place_name: "Tous les Jours",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "good amount of space and seating, works well as a study spot. gets busy but never felt too chaotic to focus",
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Mode: LIVE INSERT`);
  console.log(`User: ${USER_ID}\n`);

  // Step 1: resolve place IDs ------------------------------------------------

  const placeNames = RATINGS_INPUT.map((r) => r.place_name);

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

  for (const name of placeNames) {
    const lookupName = ALL_NAME_OVERRIDES[name] ?? name;
    const id = placeMap.get(lookupName.toLowerCase());
    if (id) {
      resolved.set(name, id);
    } else {
      console.log(`FLAGGED: "${name}" not found in places table -- skipping`);
      flagged.push(name);
    }
  }

  // Step 2: check for existing ratings (duplicate guard) --------------------

  const placeIds = [...resolved.values()];

  const { data: existingRatings, error: existingError } = await supabase
    .from("ratings")
    .select("place_id")
    .eq("user_id", USER_ID)
    .in(
      "place_id",
      placeIds.length > 0
        ? placeIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (existingError) {
    console.error("Failed to query existing ratings:", existingError.message);
    process.exit(1);
  }

  const existingPlaceIds = new Set(
    (existingRatings ?? []).map((r) => r.place_id),
  );

  // Step 3: build rows to insert --------------------------------------------

  const toInsert: RatingRow[] = [];
  let alreadyExistsCount = 0;

  for (const input of RATINGS_INPUT) {
    const placeId = resolved.get(input.place_name);
    if (!placeId) continue; // flagged/skipped

    if (existingPlaceIds.has(placeId)) {
      console.log(`SKIPPING: rating already exists for "${input.place_name}"`);
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

  // Step 4: insert ----------------------------------------------------------

  if (toInsert.length === 0) {
    console.log("\nNothing to insert.");
  } else {
    console.log(`\nInserting ${toInsert.length} rating(s)...`);
    const { error: insertError } = await supabase
      .from("ratings")
      .insert(toInsert);
    if (insertError) {
      console.error("Insert failed:", insertError.message);
      process.exit(1);
    }
    console.log("Insert successful.");
  }

  // Step 5: summary ----------------------------------------------------------

  console.log("\n=== Seed Summary ===");
  console.log(`Inserted:                 ${toInsert.length}`);
  console.log(`Skipped (already exists): ${alreadyExistsCount}`);
  console.log(`Flagged (not in places):  ${flagged.length}`);
  if (flagged.length > 0) {
    console.log(`Flagged places: ${flagged.map((n) => `"${n}"`).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
