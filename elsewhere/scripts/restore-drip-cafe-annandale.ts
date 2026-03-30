/**
 * Restore **DRiP Cà Phê** (often searched as “Drip Cafe”) in Annandale, VA to `public.places`.
 * Does not touch any other rows — single upsert by `google_place_id` from Google Places (New) Text Search.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/restore-drip-cafe-annandale.ts
 *   npx ts-node scripts/restore-drip-cafe-annandale.ts --dry-run
 *
 * Requires in .env.local:
 *   GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/** Text Search queries to try (most specific first). */
const SEARCH_QUERIES = [
  "DRiP Cà Phê 4230 Annandale Rd Annandale VA",
  "DRiP Cà Phê Annandale VA",
  "Drip cafe Annandale VA Seoul Plaza",
] as const;

if (!GOOGLE_PLACES_API_KEY) {
  throw new Error("GOOGLE_PLACES_API_KEY is required in .env.local");
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local (unless --dry-run)",
  );
}

interface LocalizedText {
  text?: string;
}
interface LatLng {
  latitude?: number;
  longitude?: number;
}
interface Photo {
  name?: string;
}
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
}
interface SearchTextResponse {
  places?: PlaceResource[];
}

function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Pick the Seoul Plaza / Annandale Rd DRiP location — name must include “drip”, address Annandale.
 */
function pickDripAnnandale(places: PlaceResource[]): PlaceResource | null {
  const candidates = places.filter((p) => {
    const name = normalize(p.displayName?.text ?? "");
    const addr = normalize(p.formattedAddress ?? "");
    return name.includes("drip") && addr.includes("annandale");
  });
  if (candidates.length === 0) return null;

  const with4230 = candidates.find((p) =>
    normalize(p.formattedAddress ?? "").includes("4230"),
  );
  return with4230 ?? candidates[0]!;
}

async function searchText(textQuery: string): Promise<PlaceResource[]> {
  const res = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 20 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places searchText HTTP ${res.status}: ${text}`);
  }
  const data = (await res.json()) as SearchTextResponse;
  return data.places ?? [];
}

function mapToRow(place: PlaceResource): {
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: "cafe";
  google_photo_ref: string | null;
  opening_hours: Record<string, unknown> | null;
  has_wifi: null;
  is_active: boolean;
  created_by: null;
} | null {
  const googlePlaceId = place.id?.trim();
  if (!googlePlaceId) return null;

  const latRaw = place.location?.latitude;
  const lngRaw = place.location?.longitude;
  if (
    latRaw == null ||
    lngRaw == null ||
    Number.isNaN(latRaw) ||
    Number.isNaN(lngRaw)
  ) {
    return null;
  }

  const rawPhoto = place.photos?.[0]?.name?.trim();
  let googlePhotoRef: string | null = null;
  if (rawPhoto) {
    googlePhotoRef = rawPhoto.replace(/\/media$/, "");
  }

  const openingHours = place.currentOpeningHours
    ? ({
        open_now: place.currentOpeningHours.openNow ?? null,
        weekday_descriptions:
          place.currentOpeningHours.weekdayDescriptions ?? null,
        periods: place.currentOpeningHours.periods ?? null,
      } as Record<string, unknown>)
    : null;

  return {
    google_place_id: googlePlaceId,
    name: (place.displayName?.text ?? "DRiP Cà Phê").trim() || "DRiP Cà Phê",
    address: (place.formattedAddress ?? "").trim() || "Address unknown",
    lat: roundCoord7(latRaw),
    lng: roundCoord7(lngRaw),
    place_type: "cafe",
    google_photo_ref: googlePhotoRef,
    opening_hours: openingHours,
    has_wifi: null,
    is_active: true,
    created_by: null,
  };
}

async function main(): Promise<void> {
  let chosen: PlaceResource | null = null;
  let usedQuery: string | null = null;

  for (const q of SEARCH_QUERIES) {
    const list = await searchText(q);
    chosen = pickDripAnnandale(list);
    if (chosen) {
      usedQuery = q;
      break;
    }
  }

  if (!chosen) {
    throw new Error(
      "Could not resolve DRiP Cà Phê (Annandale) from Google Text Search. Try updating SEARCH_QUERIES.",
    );
  }

  const row = mapToRow(chosen);
  if (!row) {
    throw new Error("Resolved place is missing id or coordinates.");
  }

  console.log(`Query used: "${usedQuery}"`);
  console.log(
    `→ ${row.name} | ${row.google_place_id}\n  ${row.address}\n  (${row.lat}, ${row.lng})`,
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: no Supabase write.");
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.from("places").upsert(row, {
    onConflict: "google_place_id",
  });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log("\nUpserted place (is_active=true).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
