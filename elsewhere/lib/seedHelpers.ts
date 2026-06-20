/**
 * Shared helpers for seeding scripts.
 * Exported so they can be unit-tested and reused across scripts.
 */

import { createClient } from "@supabase/supabase-js";

// ── Enum types ────────────────────────────────────────────────────────────────

export type NoiseLevel = "silent" | "quiet" | "vibrant";
export type VibeLevel = "focused" | "casual" | "social";
export type TablesLabel = "limited" | "mixed" | "plentiful";
export type OutletsLabel = "scarce" | "some" | "ample";

// ── Name overrides ────────────────────────────────────────────────────────────

/** Maps seed entry name → canonical DB name for places stored under a different name. */
export const NAME_OVERRIDES: Record<string, string> = {
  "Rare Bird": "Rare Bird Coffee Roasters",
  "De Clieu": "De Clieu Coffee & Sandwich - Fairfax",
  "Common Culture": "Common Culture Specialty Coffee & Brunch",
  "Simply Social": "Fairfax Simply Social Coffee",
  "Bakery Museum and Co.": "Bakery Museum & Co",
  "Tous les Jours": "Tous Les Jours Bakery Cafe",
  "Chateau de Chantilly": "Chateau de Chantilly Cafe",
  "Frame": "FRAME Coffee Roasters",
  "Caffe Amouri": "Caffe Amouri Coffee Roaster",
  "Peet's": "Peet's Coffee",
  "Senberry": "Senberry Bowls",
};

// ── Enum normalization ────────────────────────────────────────────────────────

export function normalizeNoise(raw: string): NoiseLevel {
  const map: Record<string, NoiseLevel> = {
    silent: "silent",
    quiet: "quiet",
    vibrant: "vibrant",
    // input aliases
    moderate: "quiet",
    loud: "vibrant",
  };
  const v = map[raw.toLowerCase()];
  if (!v) throw new Error(`Unknown noise value: "${raw}"`);
  return v;
}

export function normalizeVibe(raw: string): VibeLevel {
  const map: Record<string, VibeLevel> = {
    focused: "focused",
    casual: "casual",
    social: "social",
    // input alias
    cozy: "casual",
  };
  const v = map[raw.toLowerCase()];
  if (!v) throw new Error(`Unknown vibe value: "${raw}"`);
  return v;
}

export function normalizeTables(raw: string): TablesLabel {
  const map: Record<string, TablesLabel> = {
    limited: "limited",
    mixed: "mixed",
    plentiful: "plentiful",
    // input aliases
    scarce: "limited",
    moderate: "mixed",
  };
  const v = map[raw.toLowerCase()];
  if (!v) throw new Error(`Unknown tables value: "${raw}"`);
  return v;
}

export function normalizeOutlets(raw: string): OutletsLabel {
  const map: Record<string, OutletsLabel> = {
    scarce: "scarce",
    some: "some",
    ample: "ample",
    // input alias
    moderate: "some",
  };
  const v = map[raw.toLowerCase()];
  if (!v) throw new Error(`Unknown outlets value: "${raw}"`);
  return v;
}

// ── Place-creation helpers (shared by review-missing-places.ts and approve-and-seed.ts) ──

export type PlaceType = "cafe" | "library" | "bookstore" | "tea_shop";
export const VALID_PLACE_TYPES = new Set<string>(["cafe", "library", "bookstore", "tea_shop"]);

export interface PlaceResource {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: { name?: string }[];
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: unknown[];
  };
  primaryType?: string;
}

const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "photos",
  "currentOpeningHours",
  "primaryType",
].join(",");

export async function fetchPlaceDetails(
  googlePlaceId: string,
  apiKey: string,
): Promise<PlaceResource> {
  const id = googlePlaceId.startsWith("places/")
    ? googlePlaceId.slice("places/".length)
    : googlePlaceId;
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<PlaceResource>;
}

function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

export function inferPlaceType(primaryType?: string): PlaceType {
  if (!primaryType) return "cafe";
  const t = primaryType.toLowerCase();
  if (t.includes("library")) return "library";
  if (t.includes("book_store") || t.includes("bookstore")) return "bookstore";
  if (t.includes("tea")) return "tea_shop";
  return "cafe";
}

export function mapPlaceToRow(place: PlaceResource, placeType: PlaceType) {
  const googlePlaceId = (place.id ?? place.name)?.trim();
  if (!googlePlaceId) throw new Error("Google place has no id");
  const latRaw = place.location?.latitude;
  const lngRaw = place.location?.longitude;
  if (latRaw == null || lngRaw == null) throw new Error("Google place has no coordinates");
  const name = (place.displayName?.text ?? "Unknown").trim() || "Unknown";
  const address = (place.formattedAddress ?? "").trim() || "Address unknown";
  const rawPhoto = place.photos?.[0]?.name?.trim();
  const googlePhotoRef = rawPhoto ? rawPhoto.replace(/\/media$/, "") : null;
  const openingHours = place.currentOpeningHours
    ? {
        open_now: place.currentOpeningHours.openNow ?? null,
        weekday_descriptions: place.currentOpeningHours.weekdayDescriptions ?? null,
        periods: place.currentOpeningHours.periods ?? null,
      }
    : null;
  return {
    google_place_id: googlePlaceId,
    name,
    address,
    lat: roundCoord7(latRaw),
    lng: roundCoord7(lngRaw),
    place_type: placeType,
    google_photo_ref: googlePhotoRef,
    opening_hours: openingHours,
    has_wifi: null,
    is_active: true,
    created_by: null,
  };
}

// ── Google Places Text Search ─────────────────────────────────────────────────

const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
].join(",");

/**
 * Runs a Google Places (New) Text Search and returns the top result, or null
 * if nothing matched. Callers should verify the returned name/address before
 * using the id, then call fetchPlaceDetails for the full field set.
 */
export async function searchTextPlaces(
  query: string,
  apiKey: string,
): Promise<{ id: string; displayName: string; formattedAddress: string } | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places Text Search error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string }[];
  };
  const first = data.places?.[0];
  if (!first?.id) return null;
  return {
    id: first.id,
    displayName: first.displayName?.text ?? "(unknown)",
    formattedAddress: first.formattedAddress ?? "",
  };
}

// ── Photo-seeding helper (shared by approve-and-seed.ts) ─────────────────────

const SEED_MAX_PHOTOS = 8;
const SEED_MAX_FETCH = 20;
const SEED_DELAY_MS = 500;

function seedSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function seedPhotosForPlace(
  supabase: ReturnType<typeof createClient>,
  placeId: string,
  placeName: string,
  googlePlaceId: string,
  apiKey: string,
  supabaseUrl: string,
): Promise<number> {
  const resourceId = googlePlaceId.startsWith("places/")
    ? googlePlaceId.slice(7)
    : googlePlaceId;

  const photosRes = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(resourceId)}`,
    { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" } },
  );
  if (!photosRes.ok) {
    const text = await photosRes.text();
    throw new Error(`Google Places API ${photosRes.status}: ${text}`);
  }
  const photosData = (await photosRes.json()) as { photos?: { name: string }[] };
  const photoNames = (photosData.photos ?? []).slice(0, SEED_MAX_FETCH);

  if (photoNames.length === 0) {
    console.log(`  No photos available from Google for "${placeName}"`);
    return 0;
  }
  console.log(`  Found ${photoNames.length} photo(s). Uploading up to ${SEED_MAX_PHOTOS}...`);

  const uploadedUrls: string[] = [];

  for (const photo of photoNames) {
    if (uploadedUrls.length >= SEED_MAX_PHOTOS) break;
    const parts = photo.name.split("/");
    const photoRef = parts[parts.length - 1] ?? photo.name;
    try {
      await seedSleep(SEED_DELAY_MS);
      const mediaUrl =
        `https://places.googleapis.com/v1/${photo.name}/media` +
        `?maxHeightPx=1200&maxWidthPx=1200&skipHttpRedirect=true&key=${apiKey}`;
      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) continue;
      const mediaData = (await mediaRes.json()) as { photoUri?: string };
      if (!mediaData.photoUri) continue;

      const imageRes = await fetch(mediaData.photoUri);
      if (!imageRes.ok) continue;
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

      const storagePath = `google-photos/${placeId}/${photoRef}.jpg`;
      const { error } = await supabase.storage
        .from("user-photos")
        .upload(storagePath, imageBuffer, { contentType: "image/jpeg", upsert: true });
      if (error) {
        console.error(`    Upload failed for ${photoRef}: ${error.message}`);
        continue;
      }
      uploadedUrls.push(`${supabaseUrl}/storage/v1/object/public/user-photos/${storagePath}`);
      console.log(`    Uploaded photo ${uploadedUrls.length}`);
    } catch (e) {
      console.error(`    Error on ${photoRef}:`, e instanceof Error ? e.message : String(e));
    }
  }

  if (uploadedUrls.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db
      .from("places")
      .update({ google_photo_urls: uploadedUrls })
      .eq("id", placeId);
    if (error) throw new Error(`Failed to save photo URLs: ${(error as { message: string }).message}`);
  }

  return uploadedUrls.length;
}
