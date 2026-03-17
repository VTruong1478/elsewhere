/**
 * One-time script to backfill google_place_id, google_photo_ref, and has_wifi
 * for the 8 seeded NoVA places using the Google Places API (server-side only).
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-place-details.ts
 *
 * Requires in .env.local:
 *   GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing .env.local at ${envPath}. Run from the elsewhere app directory.`,
    );
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const commentStart = value.indexOf("#");
    if (commentStart >= 0) value = value.slice(0, commentStart).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvLocal();

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_PLACES_API_KEY) {
  throw new Error("GOOGLE_PLACES_API_KEY is required in .env.local");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local",
  );
}

type SeedKey =
  | "breeze"
  | "shilla"
  | "de_clieu"
  | "city_of_fairfax_library"
  | "barnes"
  | "foundation"
  | "george_mason_library"
  | "thomas";

type PlaceIdMapping = {
  key: SeedKey;
  google_place_id: string;
  db_name: string;
};

const PLACE_IDS: PlaceIdMapping[] = [
  {
    key: "breeze",
    google_place_id: "ChIJ_9qftsRMtokRMXYhiayW3UI",
    db_name: "Breeze Bakery Cafe",
  },
  {
    key: "shilla",
    google_place_id: "ChIJrY0JbgBLtokR7OMUXNv899E",
    db_name: "Shilla Bakery Vienna",
  },
  {
    key: "de_clieu",
    google_place_id: "ChIJXRjFSZJOtokRDouo_quteDk",
    db_name: "De Clieu Coffee & Sandwich - Fairfax",
  },
  {
    key: "city_of_fairfax_library",
    google_place_id: "ChIJ1QmPYZFOtokRiYgIraVyXGY",
    db_name: "City of Fairfax Regional Library",
  },
  {
    key: "barnes",
    google_place_id: "ChIJZ0BynW5LtokRdajVJEOHVfI",
    db_name: "Barnes & Noble - Mosaic District",
  },
  {
    key: "foundation",
    google_place_id: "ChIJW7gQbS9NtokRkLOvuHFeOkQ",
    db_name: "Foundation Coffee",
  },
  {
    key: "george_mason_library",
    google_place_id: "ChIJTXJw-y6zt4kRhHrGAncHT1c",
    db_name: "George Mason Regional Library",
  },
  {
    key: "thomas",
    google_place_id: "ChIJ_dk6Z1ZLtokR03Voe_4PYa4",
    db_name: "Thomas Jefferson Library",
  },
];

interface PlacesApiPlace {
  id?: string;
  name?: string;
  photos?: { name?: string }[];
  amenities?: {
    freeWifi?: boolean;
  };
}

async function fetchPlaceDetails(
  placeId: string,
): Promise<{ google_photo_ref: string | null; has_wifi: boolean | null }> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const fieldMask = ["id", "name", "photos.name"].join(",");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": fieldMask,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Places API error for ${placeId}: ${res.status} ${res.statusText} - ${text}`,
    );
  }

  const data = (await res.json()) as PlacesApiPlace;
  const google_photo_ref =
    data.photos && data.photos.length > 0 && data.photos[0]?.name
      ? data.photos[0].name!
      : null;
  const has_wifi = null;

  return { google_photo_ref, has_wifi };
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  for (const mapping of PLACE_IDS) {
    console.log(`Updating place: ${mapping.db_name}`);

    const { data: place, error: fetchError } = await supabase
      .from("places")
      .select("id, google_place_id")
      .eq("name", mapping.db_name)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error(
        `Failed to fetch place "${mapping.db_name}":`,
        fetchError.message,
      );
      continue;
    }

    if (!place) {
      console.warn(`No place found with name "${mapping.db_name}", skipping.`);
      continue;
    }

    const { google_photo_ref, has_wifi } = await fetchPlaceDetails(
      mapping.google_place_id,
    );

    const { error: updateError } = await supabase
      .from("places")
      .update({
        google_place_id: mapping.google_place_id,
        google_photo_ref,
        has_wifi,
      })
      .eq("id", place.id);

    if (updateError) {
      console.error(
        `Failed to update place "${mapping.db_name}":`,
        updateError.message,
      );
      continue;
    }

    console.log(
      `Updated "${mapping.db_name}" with place_id=${mapping.google_place_id}, photo_ref=${google_photo_ref}, has_wifi=${has_wifi}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

