/**
 * Fetch Google Places photos, re-upload to Supabase Storage, and save public URLs
 * to places.google_photo_urls. Photos are reviewed manually via dev-tools/photo-review.html.
 *
 * PREREQUISITE — google_photo_urls text[] column must exist on public.places.
 * If missing, add it first:
 *   alter table public.places
 *     add column if not exists google_photo_urls text[] default '{}';
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-place-photos.ts --dry-run
 *   npx ts-node scripts/seed-place-photos.ts --dry-run --place-id {uuid}
 *   npx ts-node scripts/seed-place-photos.ts --place-id {uuid}
 *   npx ts-node scripts/seed-place-photos.ts
 *
 * ENV (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   GOOGLE_PLACES_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const MAX_PHOTOS_PER_PLACE = 8;
const MAX_PHOTOS_TO_FETCH = 20;
const GOOGLE_DELAY_MS = 500;

// ── CLI parsing ───────────────────────────────────────────────────────────────

function argvFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argvValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const DRY_RUN = argvFlag("--dry-run");
const SINGLE_PLACE_ID = argvValue("--place-id");

// ── Env validation ────────────────────────────────────────────────────────────

function validateEnv(): void {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!GOOGLE_PLACES_API_KEY) missing.push("GOOGLE_PLACES_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars in .env.local: ${missing.join(", ")}`
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the short photo reference token from a resource name like places/.../photos/TOKEN */
function photoRefFromName(photoName: string): string {
  const parts = photoName.split("/");
  return parts[parts.length - 1] ?? photoName;
}

// ── Google Places API (New) ───────────────────────────────────────────────────

interface GooglePhoto {
  name: string;
}

/** Fetch up to 20 photo resource names for a Google Place ID. */
async function fetchGooglePhotoNames(
  googlePlaceId: string
): Promise<GooglePhoto[]> {
  const resourceId = googlePlaceId.startsWith("places/")
    ? googlePlaceId.slice(7)
    : googlePlaceId;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(resourceId)}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "photos",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { photos?: GooglePhoto[] };
  return (data.photos ?? []).slice(0, MAX_PHOTOS_TO_FETCH);
}

/** Fetch the photoUri for a photo resource name (skipHttpRedirect=true returns JSON). */
async function fetchPhotoUri(photoName: string): Promise<string | null> {
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=1200&maxWidthPx=1200&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY!}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Photo media API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

/** Download a photo URI and return a Buffer. */
async function downloadPhoto(photoUri: string): Promise<Buffer> {
  const res = await fetch(photoUri);
  if (!res.ok) {
    throw new Error(`Photo download HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Supabase storage upload ───────────────────────────────────────────────────

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  placeId: string,
  photoRef: string,
  imageBuffer: Buffer
): Promise<string> {
  const storagePath = `google-photos/${placeId}/${photoRef}.jpg`;
  const { error } = await supabase.storage
    .from("user-photos")
    .upload(storagePath, imageBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  return `${SUPABASE_URL!}/storage/v1/object/public/user-photos/${storagePath}`;
}

// ── Per-place logic ───────────────────────────────────────────────────────────

interface PlaceRow {
  id: string;
  name: string;
  google_place_id: string | null;
  google_photo_urls: string[] | null;
}

interface PlaceResult {
  name: string;
  status: "processed" | "skipped" | "already_had_photos" | "error";
  photoCount?: number;
  photosAvailable?: number;
  skipReason?: string;
}

async function processPlace(
  place: PlaceRow,
  supabase: ReturnType<typeof createClient>,
  index: number,
  total: number
): Promise<PlaceResult> {
  console.log(
    `Processing "${place.name}" (${index}/${total})...`
  );

  if (!place.google_place_id) {
    console.log(`  SKIPPED: "${place.name}" — no google_place_id`);
    return { name: place.name, status: "skipped", skipReason: "no google_place_id" };
  }

  if ((place.google_photo_urls ?? []).length > 0) {
    console.log(
      `  SKIPPED: "${place.name}" — already has ${place.google_photo_urls!.length} photo(s)`
    );
    return { name: place.name, status: "already_had_photos" };
  }

  // Step 1: fetch photo resource names from Google
  let photoNames: GooglePhoto[];
  try {
    await sleep(GOOGLE_DELAY_MS);
    photoNames = await fetchGooglePhotoNames(place.google_place_id);
  } catch (e) {
    console.error(
      `  ERROR fetching photos for "${place.name}":`,
      e instanceof Error ? e.message : String(e)
    );
    return { name: place.name, status: "error" };
  }

  if (photoNames.length === 0) {
    console.log(`  SKIPPED: "${place.name}" — no photos from Google`);
    return { name: place.name, status: "skipped", skipReason: "no photos from Google" };
  }

  console.log(`  Found ${photoNames.length} Google photo(s). Uploading up to ${MAX_PHOTOS_PER_PLACE}...`);

  // Steps 2-3: download → upload (all photos, no filtering)
  const uploadedUrls: string[] = [];

  for (const photo of photoNames) {
    if (uploadedUrls.length >= MAX_PHOTOS_PER_PLACE) break;

    const photoRef = photoRefFromName(photo.name);

    // Fetch photo URI then download
    let imageBuffer: Buffer;
    try {
      await sleep(GOOGLE_DELAY_MS);
      const photoUri = await fetchPhotoUri(photo.name);
      if (!photoUri) {
        console.log(`    Skipping ${photoRef} — no photoUri returned`);
        continue;
      }
      imageBuffer = await downloadPhoto(photoUri);
    } catch (e) {
      console.error(
        `    Error downloading photo ${photoRef}:`,
        e instanceof Error ? e.message : String(e)
      );
      continue;
    }

    if (DRY_RUN) {
      // In dry-run, count it as passing without uploading
      uploadedUrls.push(
        `[dry-run] ${SUPABASE_URL}/storage/v1/object/public/user-photos/google-photos/${place.id}/${photoRef}.jpg`
      );
      continue;
    }

    // Upload to Supabase Storage
    try {
      const publicUrl = await uploadToStorage(
        supabase,
        place.id,
        photoRef,
        imageBuffer
      );
      uploadedUrls.push(publicUrl);
      console.log(`    Uploaded → ${publicUrl}`);
    } catch (e) {
      console.error(
        `    Upload failed for ${photoRef}:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  console.log(
    `  ${DRY_RUN ? "[dry-run] Would upload" : "Uploaded"} ${uploadedUrls.length} photo(s) for "${place.name}"`
  );

  if (!DRY_RUN && uploadedUrls.length > 0) {
    const { error: updateError } = await supabase
      .from("places")
      .update({ google_photo_urls: uploadedUrls })
      .eq("id", place.id);
    if (updateError) {
      console.error(
        `  ERROR saving URLs for "${place.name}": ${updateError.message}`
      );
      return { name: place.name, status: "error" };
    }
  }

  return {
    name: place.name,
    status: "processed",
    photoCount: uploadedUrls.length,
  };
}

// ── Dry-run per-place logic (metadata only — no downloads) ───────────────────

async function processDryRunPlace(
  place: PlaceRow,
  index: number,
  total: number
): Promise<PlaceResult> {
  if (!place.google_place_id) {
    console.log(`[DRY RUN] "${place.name}" — skipped (no google_place_id)`);
    return { name: place.name, status: "skipped", skipReason: "no google_place_id" };
  }

  if ((place.google_photo_urls ?? []).length > 0) {
    console.log(`[DRY RUN] "${place.name}" — skipped (google_photo_urls already populated)`);
    return { name: place.name, status: "already_had_photos" };
  }

  let photoNames: GooglePhoto[];
  try {
    await sleep(GOOGLE_DELAY_MS);
    photoNames = await fetchGooglePhotoNames(place.google_place_id);
  } catch (e) {
    console.error(
      `[DRY RUN] "${place.name}" (${index}/${total}) — ERROR fetching photo metadata:`,
      e instanceof Error ? e.message : String(e)
    );
    return { name: place.name, status: "error" };
  }

  if (photoNames.length === 0) {
    console.log(`[DRY RUN] "${place.name}" — skipped (no photos from Google)`);
    return { name: place.name, status: "skipped", skipReason: "no photos from Google" };
  }

  const suffix =
    photoNames.length > MAX_PHOTOS_PER_PLACE
      ? ` (capped at ${MAX_PHOTOS_PER_PLACE})`
      : "";
  console.log(
    `[DRY RUN] "${place.name}" — ${photoNames.length} photos available from Google${suffix}`
  );
  return { name: place.name, status: "processed", photosAvailable: photoNames.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  validateEnv();

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  console.log(`Mode: ${DRY_RUN ? "DRY RUN (metadata only — no downloads)" : "LIVE"}`);
  if (SINGLE_PLACE_ID) console.log(`Single place: ${SINGLE_PLACE_ID}`);
  console.log();

  // Fetch places
  let query = supabase
    .from("places")
    .select("id, name, google_place_id, google_photo_urls")
    .eq("is_active", true);

  if (SINGLE_PLACE_ID) {
    query = query.eq("id", SINGLE_PLACE_ID);
  }

  const { data: places, error: placesError } = await query;
  if (placesError) {
    throw new Error(`Failed to query places: ${placesError.message}`);
  }
  if (!places || places.length === 0) {
    console.log("No active places found.");
    return;
  }

  const rows = places as PlaceRow[];
  console.log(`Found ${rows.length} active place(s).\n`);

  // Process each place, catching per-place errors
  const results: PlaceResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const place = rows[i]!;
    try {
      const result = DRY_RUN
        ? await processDryRunPlace(place, i + 1, rows.length)
        : await processPlace(place, supabase, i + 1, rows.length);
      results.push(result);
    } catch (e) {
      console.error(
        `Unexpected error processing "${place.name}":`,
        e instanceof Error ? e.message : String(e)
      );
      results.push({ name: place.name, status: "error" });
    }
  }

  // Summary
  const processed = results.filter((r) => r.status === "processed");
  const skipped = results.filter((r) => r.status === "skipped");
  const alreadyHad = results.filter((r) => r.status === "already_had_photos");
  const noPlaceId = skipped.filter((r) => r.skipReason === "no google_place_id");
  const totalPhotosAvailable = processed.reduce((sum, r) => sum + (r.photosAvailable ?? 0), 0);

  if (DRY_RUN) {
    console.log("\n=== Dry Run Summary ===");
    console.log(`Would process:       ${processed.length} places`);
    console.log(`Already done:        ${alreadyHad.length} places (skipped)`);
    console.log(`No google_place_id:  ${noPlaceId.length} places (skipped)`);
    console.log(`Total photos available: ${totalPhotosAvailable} (capped at ${MAX_PHOTOS_PER_PLACE} per place)`);
  } else {
    const totalUploaded = processed.reduce((sum, r) => sum + (r.photoCount ?? 0), 0);
    const errors = results.filter((r) => r.status === "error");
    console.log("\n=== Photo Seed Summary ===");
    console.log(`Processed:                    ${processed.length}`);
    console.log(`Skipped:                      ${skipped.length}`);
    console.log(`Errors:                       ${errors.length}`);
    console.log(`Total uploaded:               ${totalUploaded}`);
    console.log(`Already had photos (skipped): ${alreadyHad.length}`);
    console.log();
    console.log("Per-place breakdown:");
    for (const r of results) {
      if (r.status === "processed") {
        console.log(`  - "${r.name}": ${r.photoCount} photo(s) uploaded`);
      } else if (r.status === "already_had_photos") {
        console.log(`  - "${r.name}": skipped (already had photos)`);
      } else if (r.status === "skipped") {
        console.log(`  - "${r.name}": skipped (${r.skipReason})`);
      } else {
        console.log(`  - "${r.name}": ERROR`);
      }
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
