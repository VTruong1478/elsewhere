/**
 * Add Roasting Plant Coffee (1901 L St NW, Washington, DC 20036) to public.places.
 *
 * Looks up the place via Google Places API (Text Search), then upserts one row.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/add-place-roasting-plant.ts
 *   npx ts-node scripts/add-place-roasting-plant.ts --dry-run
 *
 * ENV (.env.local): GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_PLACES_API_KEY) {
  throw new Error("GOOGLE_PLACES_API_KEY is required in .env.local");
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local (unless --dry-run)",
  );
}

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.photos",
  "places.currentOpeningHours",
  "places.primaryType",
  "places.types",
].join(",");

/** Round to exactly 7 decimal places (matches the numeric scale used in places rows). */
function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

interface LocalizedText { text?: string }
interface LatLng { latitude?: number; longitude?: number }
interface Photo { name?: string }
interface OpeningHours {
  openNow?: boolean;
  periods?: unknown[];
  weekdayDescriptions?: string[];
}
interface PlaceResource {
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  location?: LatLng;
  photos?: Photo[];
  currentOpeningHours?: OpeningHours;
  primaryType?: string;
  types?: string[];
}
interface SearchTextResponse {
  places?: PlaceResource[];
}

async function findPlace(textQuery: string): Promise<PlaceResource[]> {
  const res = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places searchText HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as SearchTextResponse;
  return data.places ?? [];
}

async function main(): Promise<void> {
  const PLACE_QUERY = "Roasting Plant Coffee 1901 L St NW Washington DC";
  const PLACE_TYPE = "cafe" as const;

  console.log(`Searching Google Places for: "${PLACE_QUERY}"…`);
  const results = await findPlace(PLACE_QUERY);

  if (results.length === 0) {
    throw new Error("No results returned from Google Places API. Check the query or API key.");
  }

  // Pick the first result — the most relevant match for a specific address query
  const place = results[0];

  const googlePlaceId = place.id?.trim();
  if (!googlePlaceId) throw new Error("Google Place result has no ID.");

  const latRaw = place.location?.latitude;
  const lngRaw = place.location?.longitude;
  if (latRaw == null || lngRaw == null) throw new Error("Place has no coordinates.");

  const lat = roundCoord7(latRaw);
  const lng = roundCoord7(lngRaw);
  const name = (place.displayName?.text ?? "").trim() || "Roasting Plant Coffee";
  const address = (place.formattedAddress ?? "").trim() || "1901 L St NW, Washington, DC 20036";

  const rawPhoto = place.photos?.[0]?.name?.trim();
  const googlePhotoRef = rawPhoto ? rawPhoto.replace(/\/media$/, "") : null;

  const openingHours = place.currentOpeningHours
    ? {
        open_now: place.currentOpeningHours.openNow ?? null,
        weekday_descriptions: place.currentOpeningHours.weekdayDescriptions ?? null,
        periods: place.currentOpeningHours.periods ?? null,
      }
    : null;

  const row = {
    google_place_id: googlePlaceId,
    name,
    address,
    lat,
    lng,
    place_type: PLACE_TYPE,
    google_photo_ref: googlePhotoRef,
    opening_hours: openingHours,
    has_wifi: null,
    is_active: true,
    created_by: null,
  };

  console.log("\nResolved place:");
  console.log(`  Name:           ${row.name}`);
  console.log(`  Address:        ${row.address}`);
  console.log(`  Google Place ID: ${row.google_place_id}`);
  console.log(`  Coordinates:    ${row.lat}, ${row.lng}`);
  console.log(`  Photo ref:      ${row.google_photo_ref ?? "(none)"}`);
  console.log(`  Type:           ${row.place_type}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: no Supabase writes.");
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { error } = await supabase
    .from("places")
    .upsert(row, { onConflict: "google_place_id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log("\nDone — Roasting Plant Coffee upserted successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
