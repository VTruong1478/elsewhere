/**
 * Backfill google_place_id and google_photo_ref for existing rows in public.places
 * where they are null. Idempotent unless --force is passed.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/backfill-google-place-and-photo.ts
 *   npm run backfill:google
 *
 * ENV (.env.local): GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const FORCE = process.argv.includes("--force");

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

type PlaceRow = { id: string; name: string; address: string; lat: number; lng: number; google_place_id: string | null; google_photo_ref: string | null };

// --- Helpers ---
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

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

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nameCloseMatch(ourName: string, theirName: string): boolean {
  const a = normalizeForMatch(ourName);
  const b = normalizeForMatch(theirName ?? "");
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aWords = new Set(a.split(/\s+/).filter(Boolean));
  const bWords = new Set(b.split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const w of aWords) if (bWords.has(w)) overlap++;
  return overlap >= Math.min(aWords.size, bWords.size) * 0.7;
}

function addressOverlap(ourAddress: string, theirAddress: string): boolean {
  const a = normalizeForMatch(ourAddress);
  const b = normalizeForMatch(theirAddress ?? "");
  if (!a || !b) return false;
  const aParts = a.split(/[,\s]+/).filter(Boolean);
  const bParts = b.split(/[,\s]+/).filter(Boolean);
  let match = 0;
  for (const p of aParts) if (bParts.some((q) => q.includes(p) || p.includes(q))) match++;
  return match >= Math.min(2, aParts.length, bParts.length);
}

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        await delay(backoff);
      }
    }
  }
  throw lastErr;
}

// --- Google APIs ---
interface SearchPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

async function searchText(
  textQuery: string,
  lat: number,
  lng: number
): Promise<SearchPlace[]> {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 5,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 2000,
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "places.id,places.formattedAddress,places.location,places.displayName",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places searchText ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { places?: SearchPlace[] };
  return data.places ?? [];
}

/** Resolve Google place ID from places/ChIJ... to ChIJ... */
function toGooglePlaceId(placeId: string): string {
  const s = placeId.trim();
  if (s.startsWith("places/")) return s.slice(7);
  return s;
}

interface PhotoResult {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
}

async function getPlacePhotos(googlePlaceId: string): Promise<PhotoResult | null> {
  const resourceName = googlePlaceId.startsWith("places/")
    ? googlePlaceId
    : `places/${googlePlaceId}`;
  const url = `https://places.googleapis.com/v1/${resourceName}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "photos",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Place Details ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { photos?: PhotoResult[] };
  const photos = data.photos ?? [];
  return photos.length > 0 ? photos[0] : null;
}

// --- Step 1: Backfill google_place_id ---
const REPORT_SKIPPED: Array<{ id: string; name: string; address: string; reason: string }> = [];
const stats = {
  processed: 0,
  matched: 0,
  skipped: 0,
  updatedPlaceId: 0,
  updatedPhoto: 0,
  errors: 0,
};

async function step1BackfillGooglePlaceId(): Promise<void> {
  const { data: rows, error } = await supabase
    .from("places")
    .select("id, name, address, lat, lng, google_place_id")
    .is("google_place_id", null);

  if (error) throw new Error(`Supabase select: ${error.message}`);
  const candidates = (rows ?? []) as PlaceRow[];

  for (const row of candidates) {
    if (!FORCE && row.google_place_id) continue;
    stats.processed++;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const textQuery = `${row.name} ${row.address}`.trim();
    if (!textQuery) {
      REPORT_SKIPPED.push({ id: row.id, name: row.name, address: row.address, reason: "empty name+address" });
      stats.skipped++;
      continue;
    }

    try {
      const places = await fetchWithRetry(
        () => searchText(textQuery, lat, lng),
        "searchText"
      );
      await randomDelay(150, 250);

      if (places.length === 0) {
        REPORT_SKIPPED.push({ id: row.id, name: row.name, address: row.address, reason: "no_results" });
        stats.skipped++;
        continue;
      }

      const withDistance = places.map((p) => {
        const plat = p.location?.latitude ?? lat;
        const plng = p.location?.longitude ?? lng;
        return { place: p, dist: haversineMeters(lat, lng, plat, plng) };
      });
      const within250 = withDistance.filter((x) => x.dist <= 250);
      const best = within250.length > 0
        ? within250.sort((a, b) => a.dist - b.dist)[0].place
        : (() => {
            const top = places[0];
            const topName = top.displayName?.text ?? "";
            const topAddr = top.formattedAddress ?? "";
            if (nameCloseMatch(row.name, topName) && addressOverlap(row.address, topAddr)) return top;
            return null;
          })();

      if (!best || !best.id) {
        REPORT_SKIPPED.push({ id: row.id, name: row.name, address: row.address, reason: "no_confident_match" });
        stats.skipped++;
        continue;
      }

      stats.matched++;
      const gid = toGooglePlaceId(best.id);
      const { error: updateErr } = await supabase
        .from("places")
        .update({ google_place_id: gid })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[place-id] update ${row.id}: ${updateErr.message}`);
        stats.errors++;
      } else {
        stats.updatedPlaceId++;
      }
    } catch (e) {
      console.error(`[place-id] ${row.id} ${row.name}:`, e);
      stats.errors++;
      REPORT_SKIPPED.push({
        id: row.id,
        name: row.name,
        address: row.address,
        reason: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
}

// --- Step 2: Backfill google_photo_ref ---
async function step2BackfillGooglePhotoRef(): Promise<void> {
  const { data: rows, error } = await supabase
    .from("places")
    .select("id, google_place_id, google_photo_ref")
    .not("google_place_id", "is", null)
    .is("google_photo_ref", null);

  if (error) throw new Error(`Supabase select: ${error.message}`);
  const candidates = (rows ?? []) as PlaceRow[];

  for (const row of candidates) {
    if (!FORCE && row.google_photo_ref) continue;
    const gid = row.google_place_id!;

    try {
      const photo = await fetchWithRetry(
        () => getPlacePhotos(gid),
        "getPlacePhotos"
      );
      await randomDelay(150, 250);

      if (!photo || !photo.name) continue;

      const attribution =
        photo.authorAttributions && photo.authorAttributions.length > 0
          ? photo.authorAttributions
          : null;
      const payload: Record<string, unknown> = {
        google_photo_ref: photo.name,
        google_photo_attribution: attribution
          ? JSON.stringify(attribution)
          : null,
      };

      const { error: updateErr } = await supabase
        .from("places")
        .update(payload)
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[photo] update ${row.id}: ${updateErr.message}`);
        stats.errors++;
      } else {
        stats.updatedPhoto++;
      }
    } catch (e) {
      console.error(`[photo] ${row.id}:`, e);
      stats.errors++;
    }
  }
}

// --- Report ---
function writeReport(): void {
  const outDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `backfill-skipped-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  const jsonPath = `${base}.json`;
  const csvPath = `${base}.csv`;
  fs.writeFileSync(jsonPath, JSON.stringify(REPORT_SKIPPED, null, 2), "utf-8");
  const header = "id,name,address,reason";
  const csvRows = [header, ...REPORT_SKIPPED.map((r) => `"${r.id}","${(r.name ?? "").replace(/"/g, '""')}","${(r.address ?? "").replace(/"/g, '""')}","${(r.reason ?? "").replace(/"/g, '""')}"`)];
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf-8");
  console.log(`\nSkipped places report: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
}

async function main(): Promise<void> {
  console.log("Backfill google_place_id and google_photo_ref (idempotent)", FORCE ? "[--force]" : "");
  await step1BackfillGooglePlaceId();
  await step2BackfillGooglePhotoRef();
  writeReport();
  console.log("\nTotals:", stats);
  console.log("\nVerify:");
  console.log("  select count(*) from public.places where google_place_id is not null;");
  console.log("  select count(*) from public.places where google_photo_ref is not null;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
