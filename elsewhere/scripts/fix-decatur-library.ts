/**
 * One-off repair script: backfill google_place_id and google_photo_ref for the
 * single row "Decatur Library" that was skipped by the bulk backfill script.
 * Uses a stronger search query and more permissive scoring to find the correct
 * Google Place and update the row.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/fix-decatur-library.ts
 *   npm run fix:decatur
 *
 * ENV (.env.local): GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env.local at ${envPath}. Run from the elsewhere app directory.`);
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

if (!GOOGLE_PLACES_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required in .env.local"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type DbRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  google_place_id: string | null;
  google_photo_ref: string | null;
};

type SearchPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};

const DECATUR_GA_CENTER = { latitude: 33.775, longitude: -84.296 };

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toGooglePlaceId(placeId: string): string {
  const s = placeId.trim();
  if (s.startsWith("places/")) return s.slice(7);
  return s;
}

async function main(): Promise<void> {
  // 1) Fetch candidates from Supabase (name contains both decatur and library)
  const { data: rawRows, error: selectError } = await supabase
    .from("places")
    .select("id, name, address, lat, lng, google_place_id, google_photo_ref")
    .ilike("name", "%decatur%")
    .limit(5);

  if (selectError) {
    console.error("Supabase select error:", selectError.message);
    process.exit(1);
  }
  const candidates = ((rawRows ?? []) as DbRow[]).filter(
    (r) => /decatur/i.test(r.name) && /library/i.test(r.name)
  );
  if (candidates.length === 0) {
    console.log("No rows matching name containing both 'decatur' and 'library'.");
    process.exit(1);
  }

  // Pick best DB row: prefer exact "Decatur Library", then Decatur in address or closest
  const exact = candidates.find((r) => r.name.trim() === "Decatur Library");
  const row = exact ?? (() => {
    const withDecaturAddr = candidates.filter((r) =>
      String(r.address || "").toLowerCase().includes("decatur")
    );
    if (withDecaturAddr.length > 0) return withDecaturAddr[0];
    return candidates[0];
  })();

  console.log("DB candidates:", JSON.stringify(candidates, null, 2));
  console.log("Chosen row:", { id: row.id, name: row.name, address: row.address, lat: row.lat, lng: row.lng });
  console.log("Before:", { google_place_id: row.google_place_id, google_photo_ref: row.google_photo_ref });

  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const hasLatLng = !Number.isNaN(lat) && !Number.isNaN(lng);

  // 2) Location bias
  const center = hasLatLng ? { latitude: lat, longitude: lng } : DECATUR_GA_CENTER;
  const radiusMeters = hasLatLng ? 3000 : 6000;
  const locationBias = {
    circle: { center, radius: radiusMeters },
  };

  // 3) Stronger text query
  const textQuery =
    row.address && row.address.trim()
      ? `${row.name}, ${row.address}`.trim()
      : "Decatur Library, Decatur, GA";

  const url = "https://places.googleapis.com/v1/places:searchText";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 10,
      locationBias,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Places API error:", res.status, text);
    process.exit(1);
  }

  const data = (await res.json()) as { places?: SearchPlace[] };
  const places = data.places ?? [];

  if (places.length === 0) {
    console.log("No Google results. Not confident.");
    process.exit(1);
  }

  // 4) Score and pick
  const scored = places.map((p) => {
    const displayName = (p.displayName?.text ?? "").toLowerCase();
    const formattedAddress = (p.formattedAddress ?? "").toLowerCase();
    const types = (p.types ?? []).map((t) => t.toLowerCase());
    let score = 0;
    if (displayName.includes("decatur") && displayName.includes("library")) score += 3;
    if (formattedAddress.includes("decatur, ga")) score += 2;
    const plat = p.location?.latitude ?? lat;
    const plng = p.location?.longitude ?? lng;
    const dist = hasLatLng ? haversineMeters(lat, lng, plat, plng) : Infinity;
    if (dist <= 1500) score += 2;
    if (types.some((t) => t.includes("library"))) score += 1;
    return { place: p, score, dist: hasLatLng ? dist : null };
  });

  scored.sort((a, b) => b.score - a.score);
  console.log(
    "Ranked results:",
    scored.map((s) => ({
      name: s.place.displayName?.text,
      address: s.place.formattedAddress,
      score: s.score,
      distM: s.dist != null ? Math.round(s.dist) : null,
    }))
  );

  const best = scored[0];
  if (best.score < 4) {
    console.log("Best score < 4. Not confident.");
    process.exit(1);
  }

  const chosen = best.place;
  const googlePlaceId = chosen.id ? toGooglePlaceId(chosen.id) : null;
  if (!googlePlaceId) {
    console.log("No place id on chosen result.");
    process.exit(1);
  }

  console.log("Chosen:", {
    id: googlePlaceId,
    displayName: chosen.displayName?.text,
    formattedAddress: chosen.formattedAddress,
    score: best.score,
  });

  // 5) Update google_place_id only if null
  if (row.google_place_id == null || row.google_place_id === "") {
    const { error: updateIdError } = await supabase
      .from("places")
      .update({ google_place_id: googlePlaceId })
      .eq("id", row.id);
    if (updateIdError) {
      console.error("Update google_place_id error:", updateIdError.message);
      process.exit(1);
    }
    console.log("Updated google_place_id.");
  } else {
    console.log("google_place_id already set, skipped update.");
  }

  // 6) Fetch photos and update google_photo_ref / google_photo_attribution
  // If we already have a photo ref (e.g. from a previous run), extract place id from it
  // and fetch that place's details for attribution only (avoids depending on search order).
  type PhotoWithAttribution = {
    name?: string;
    authorAttributions?: Array<{ displayName?: string; uri?: string }>;
  };

  const existingPhotoRef = (row.google_photo_ref ?? "").trim();
  const placeIdForPhotos =
    existingPhotoRef.startsWith("places/") && existingPhotoRef.includes("/photos/")
      ? existingPhotoRef.replace(/^places\/([^/]+)\/photos\/.*/, "places/$1")
      : null;

  const resourceName =
    placeIdForPhotos ??
    (googlePlaceId.startsWith("places/") ? googlePlaceId : `places/${googlePlaceId}`);
  const photoRes = await fetch(
    `https://places.googleapis.com/v1/${resourceName}`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": "photos",
      },
    }
  );
  if (!photoRes.ok) {
    console.error("Place Details (photos) error:", photoRes.status);
    process.exit(1);
  }
  const photoData = (await photoRes.json()) as { photos?: PhotoWithAttribution[] };
  const photos = photoData.photos ?? [];
  const firstPhoto = photos.length > 0 ? photos[0] : null;
  const firstPhotoName = firstPhoto?.name ?? null;

  const attribution =
    firstPhoto?.authorAttributions && firstPhoto.authorAttributions.length > 0
      ? firstPhoto.authorAttributions
      : null;
  const payload: Record<string, unknown> = {};
  if ((row.google_photo_ref == null || row.google_photo_ref === "") && firstPhotoName) {
    payload.google_photo_ref = firstPhotoName;
  }
  if (attribution) {
    payload.google_photo_attribution = JSON.stringify(attribution);
  }

  if (!firstPhotoName && (row.google_photo_ref == null || row.google_photo_ref === "")) {
    console.log("No photos returned and no existing ref.");
    process.exit(1);
  }

  if (Object.keys(payload).length > 0) {
    const { error: updatePhotoError } = await supabase
      .from("places")
      .update(payload)
      .eq("id", row.id);
    if (updatePhotoError) {
      console.error("Update photo/attribution error:", updatePhotoError.message);
      process.exit(1);
    }
    if (payload.google_photo_ref) console.log("Updated google_photo_ref.");
    if (payload.google_photo_attribution) console.log("Updated google_photo_attribution.");
  } else {
    console.log("google_photo_ref and attribution already set, skipped update.");
  }

  // 7) After state
  const { data: after } = await supabase
    .from("places")
    .select("google_place_id, google_photo_ref, google_photo_attribution")
    .eq("id", row.id)
    .single();
  console.log("After:", after ?? {});
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
