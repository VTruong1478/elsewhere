/**
 * Seed ratings for a set of NoVA cafes attached to a specific user.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-nova-ratings.ts --dry-run
 *   npx ts-node scripts/seed-nova-ratings.ts
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Enum mapping — input values not in the DB schema are normalized:
 *   noise:   moderate → quiet  |  loud → vibrant
 *   vibe:    cozy → casual
 *   outlets: moderate → some
 *   tables:  scarce → limited
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

const USER_ID = "d9dd2d19-a7d9-49bb-82f0-0ba2f4fd80df";

// ── Input data ───────────────────────────────────────────────────────────────

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
    place_name: "Fairfax Coffee",
    overall_rating: 5.0,
    noise: "silent",
    vibe: "focused",
    outlets: "ample",
    tables: "plentiful",
    notes:
      "Quiet, lots of chargers, big comfortable space. Try the iced latte with blackberry syrup and light white mocha.",
  },
  {
    place_name: "Foundation Coffee",
    overall_rating: 4.5,
    noise: "moderate",
    vibe: "focused",
    outlets: "ample",
    tables: "plentiful",
    notes:
      "Already set up as a study cafe with lots of seats and chargers. Gets busy and loud in the afternoon so go early. Open until 9PM.",
  },
  {
    place_name: "Maman",
    overall_rating: 1.0,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "scarce",
    notes: "Grab and go only. Super busy, loud, and small. Not a work spot.",
  },
  {
    place_name: "Bakery Museum and Co.",
    overall_rating: 2.0,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes:
      "Loud music, cramped, and always busy. Better for hanging out than working. Known for flashier drinks like the tiramisu latte.",
  },
  {
    place_name: "Simply Social",
    overall_rating: 2.5,
    noise: "moderate",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes:
      "Pretty small and cramped. They give you a complimentary pizzelle cookie with every drink which is a nice touch.",
  },
  {
    place_name: "Compass Coffee",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "Nice well-lit space with wall to wall windows. Decent outlets. Americano is on the bitter side but the space is great.",
  },
  {
    place_name: "Gathering Grounds",
    overall_rating: 2.5,
    noise: "loud",
    vibe: "cozy",
    outlets: "moderate",
    tables: "limited",
    notes:
      "Used to be a great study spot during GMU undergrad days but has gone downhill since new management took over. Not as cozy, louder.",
  },
  {
    place_name: "29th Parallel Coffee",
    overall_rating: 4.0,
    noise: "silent",
    vibe: "focused",
    outlets: "moderate",
    tables: "limited",
    notes:
      "Super high quality coffee. Small and limited seating but pretty quiet. One of the best in NoVA for coffee quality.",
  },
  {
    place_name: "De Clieu",
    overall_rating: 1.5,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes:
      "Overhyped. Worst americano in the area. Gets super busy, closes early, and feels overstimulating and messy.",
  },
  {
    place_name: "Common Culture",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes: "Newer spot with a nice big space and lots of seating. Coffee is decent. Worth trying.",
  },
  {
    place_name: "Peet's",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "Solid coffee and food for a chain. Decent size and seating. Loud music makes it tough for virtual meetings.",
  },
  {
    place_name: "Senberry",
    overall_rating: 2.5,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes: "More of a hangout and acai spot than a work cafe. Loud and busy. Best acai in NoVA though.",
  },
  {
    place_name: "Cafein",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes: "Decent size and seating. Gets busy fast. The salmon lox bagel sandwich is fantastic.",
  },
  {
    place_name: "Cafe V",
    overall_rating: 3.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "limited",
    notes: "Good coffee but on the expensive side. Decent space but gets loud.",
  },
  {
    place_name: "Chateau de Chantilly",
    overall_rating: 2.5,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes:
      "Gets busy and overstimulating. More of a hangout spot than a work cafe. Pastries tend to be dry.",
  },
  {
    place_name: "Tous les Jours",
    overall_rating: 4.0,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "Nice big space with lots of seating. Gets pretty busy but has enough ambient noise that it works for video calls too.",
  },
  {
    place_name: "Rare Bird",
    overall_rating: 1.5,
    noise: "loud",
    vibe: "social",
    outlets: "scarce",
    tables: "scarce",
    notes:
      "Small, cramped, and always packed with a long line. Not a work spot at all. Breakfast sandwiches are good though.",
  },
  {
    place_name: "Godfrey's",
    overall_rating: 3.0,
    noise: "moderate",
    vibe: "social",
    outlets: "scarce",
    tables: "limited",
    notes: "More of a hangout space than a work cafe. Food is actually quite good but expensive.",
  },
  {
    place_name: "Goosecup",
    overall_rating: 3.5,
    noise: "moderate",
    vibe: "cozy",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "Nice space with decent seating and lighting. Only visited during busy times so hard to fully judge.",
  },
  {
    place_name: "Frame",
    overall_rating: 2.5,
    noise: "moderate",
    vibe: "social",
    outlets: "scarce",
    tables: "scarce",
    notes:
      "Small and cramped, hard to get work done here. Skip the coffee and try the strawberry matcha latte.",
  },
  {
    place_name: "Caffe Amouri",
    overall_rating: 4.0,
    noise: "silent",
    vibe: "focused",
    outlets: "moderate",
    tables: "plentiful",
    notes:
      "Lots of seating, seems nicest early in the day. One of the only local cafes that roasts their own beans.",
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

export async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "LIVE INSERT"}`);
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
    const lookupName = NAME_OVERRIDES[name] ?? name;
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
    .in("place_id", placeIds.length > 0 ? placeIds : ["00000000-0000-0000-0000-000000000000"]);

  if (existingError) {
    console.error("Failed to query existing ratings:", existingError.message);
    process.exit(1);
  }

  const existingPlaceIds = new Set((existingRatings ?? []).map((r) => r.place_id));

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

  // Step 4: dry run or insert -----------------------------------------------

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
