import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load .env.local from the app root (run from elsewhere/ so cwd is app root)
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
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
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

// Types for Google Places API (New) response
interface LocalizedText {
  text?: string;
  languageCode?: string;
}

interface LatLng {
  latitude?: number;
  longitude?: number;
}

interface OpeningHours {
  openNow?: boolean;
  periods?: unknown[];
  weekdayDescriptions?: string[];
}

interface Photo {
  name?: string;
  widthPx?: number;
  heightPx?: number;
}

interface PlaceResponse {
  name?: string; // "places/ChIJ..."
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  location?: LatLng;
  rating?: number;
  currentOpeningHours?: OpeningHours;
  photos?: Photo[];
  primaryType?: string;
  types?: string[];
  timeZone?: { id?: string };
}

interface SearchTextResponse {
  places?: PlaceResponse[];
}

// Map Google Place to Supabase places row (matches migration schema)
function placeToRow(place: PlaceResponse): Record<string, unknown> {
  const name = place.displayName?.text ?? place.name ?? "Unknown";
  const address = place.formattedAddress ?? "";
  const lat = place.location?.latitude ?? 0;
  const lng = place.location?.longitude ?? 0;
  // Places API (New): places[i].id is the standalone place ID (e.g. ChIJ...); name is "places/ChIJ..."
  const googlePlaceId =
    place.id ??
    (typeof place.name === "string" && place.name.startsWith("places/")
      ? place.name.slice(7)
      : null);
  const firstPhoto = place.photos?.[0];
  const googlePhotoRef = firstPhoto?.name ?? null;
  const openingHours = place.currentOpeningHours
    ? (place.currentOpeningHours as Record<string, unknown>)
    : null;
  const timezone = place.timeZone?.id ?? null;
  const primaryType = (
    place.primaryType ??
    place.types?.[0] ??
    "establishment"
  ).toLowerCase();
  const placeType = mapPlaceType(primaryType);

  return {
    google_place_id: googlePlaceId,
    name,
    address,
    lat,
    lng,
    place_type: placeType,
    google_photo_ref: googlePhotoRef,
    google_photo_attribution: null,
    opening_hours: openingHours,
    timezone,
    updated_at: new Date().toISOString(),
  };
}

function mapPlaceType(googleType: string): string {
  const t = googleType.toLowerCase();
  if (t === "library" || t === "public_library") return "library";
  if (t === "cafe" || t === "coffee_shop" || t === "restaurant") return "cafe";
  if (t === "book_store" || t === "bookstore") return "bookstore";
  if (t.includes("cowork") || t === "office") return "coworking_space";
  return t || "cafe";
}

async function fetchPlaces(): Promise<PlaceResponse[]> {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = [
    "places.id",
    "places.name",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.currentOpeningHours",
    "places.photos",
    "places.primaryType",
    "places.types",
    "places.timeZone",
  ].join(",");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      textQuery: "libraries and coffee shops for working in Northern Virginia",
      maxResultCount: 8,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as SearchTextResponse;
  return data.places ?? [];
}

async function main(): Promise<void> {
  const places = await fetchPlaces();
  if (places.length === 0) {
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Remove broken seeded rows (google_place_id IS NULL or placeholder id) so re-run is clean
  const { error: deleteError } = await supabase
    .from("places")
    .delete()
    .is("google_place_id", null);

  if (deleteError) {
    throw new Error(`Failed to delete broken rows: ${deleteError.message}`);
  }

  const rows = places.map(placeToRow);

  const { error } = await supabase.from("places").upsert(rows, {
    onConflict: "google_place_id",
  });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
