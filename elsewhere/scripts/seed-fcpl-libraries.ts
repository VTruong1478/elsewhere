/**
 * Insert missing Fairfax County Public Library (FCPL) branches into public.places.
 *
 * Uses the official branch lineup from fairfaxcounty.gov (23 locations) and
 * Google Places API (New) Text Search to resolve google_place_id, address,
 * hours, and photo ref — same row shape as scripts/seed-places.ts.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-fcpl-libraries.ts
 *   npx ts-node scripts/seed-fcpl-libraries.ts --dry-run
 *
 * ENV (.env.local): GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY (optional for --dry-run)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import dotenv from "dotenv";
import { Client } from "pg";
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

/**
 * One Text Search query per FCPL branch (23), aligned with
 * https://www.fairfaxcounty.gov/library/branches
 * Virginia Room is co-located with City of Fairfax Regional — not separate.
 */
const FCPL_BRANCH_TEXT_QUERIES = [
  "Fairfax County Public Library Burke Centre VA",
  "Fairfax County Public Library Centreville Regional VA",
  "Fairfax County Public Library Chantilly Regional VA",
  "City of Fairfax Regional Library Fairfax VA",
  "Fairfax County Public Library Culmore VA",
  "Fairfax County Public Library Dolley Madison VA",
  "George Mason Regional Library Annandale VA",
  "Fairfax County Public Library Great Falls VA",
  "Herndon Fortnightly Library Herndon VA",
  "Fairfax County Public Library John Marshall VA",
  "Fairfax County Public Library Kings Park VA",
  "Fairfax County Public Library Kingstowne VA",
  "Fairfax County Public Library Lorton VA",
  "Fairfax County Public Library Martha Washington VA",
  "Fairfax County Public Library Oakton VA",
  "Fairfax County Public Library Patrick Henry VA",
  "Pohick Regional Library Lorton VA",
  "Reston Regional Library VA",
  "Richard Byrd Library Alexandria VA",
  "Sherwood Regional Library Alexandria VA",
  "Fairfax County Public Library Thomas Jefferson VA",
  "Tysons Pimmit Regional Library VA",
  "Access Services Fairfax County Public Library Fairfax VA",
] as const;

type PlaceType = "cafe" | "library";

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
  primaryType?: string;
  types?: string[];
}

interface SearchTextResponse {
  places?: PlaceResource[];
}

interface PlaceRow {
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: PlaceType;
  google_photo_ref: string | null;
  opening_hours: Record<string, unknown> | null;
  has_wifi: null;
  is_active: boolean;
  created_by: null;
}

function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

function isLikelyVirginiaLibrary(place: PlaceResource): boolean {
  const addr = (place.formattedAddress ?? "").toLowerCase();
  if (!addr.includes("va ") && !addr.endsWith(", va")) {
    if (!/\bva\b/.test(addr)) {
      return false;
    }
  }
  if (/\b(md|wv|dc),?\s*\d{5}\b/i.test(place.formattedAddress ?? "")) {
    return false;
  }
  return true;
}

function isLibraryPlaceType(place: PlaceResource): boolean {
  const types = place.types ?? [];
  const primary = (place.primaryType ?? "").toLowerCase();
  if (types.includes("library") || types.includes("public_library")) {
    return true;
  }
  return primary.includes("library");
}

function mapPlaceToRow(
  place: PlaceResource,
  placeType: PlaceType,
): PlaceRow | null {
  const googlePlaceId = place.id?.trim();
  if (!googlePlaceId) {
    return null;
  }

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

  const lat = roundCoord7(latRaw);
  const lng = roundCoord7(lngRaw);

  const name = (place.displayName?.text ?? "Unknown").trim() || "Unknown";
  const address =
    (place.formattedAddress ?? "").trim() || "Address unknown";

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
    name,
    address,
    lat,
    lng,
    place_type: placeType,
    google_photo_ref: googlePhotoRef,
    opening_hours: openingHours,
    has_wifi: null,
    is_active: true,
    created_by: null,
  };
}

async function searchTextOnce(textQuery: string): Promise<SearchTextResponse> {
  const body = {
    textQuery,
    maxResultCount: 20,
  };

  const res = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places searchText HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<SearchTextResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pick first Places result that looks like a VA library, or null. */
function pickLibraryFromResults(
  places: PlaceResource[] | undefined,
): PlaceResource | null {
  if (!places?.length) {
    return null;
  }
  for (const p of places) {
    if (isLibraryPlaceType(p) && isLikelyVirginiaLibrary(p)) {
      return p;
    }
  }
  for (const p of places) {
    if (isLikelyVirginiaLibrary(p)) {
      return p;
    }
  }
  return places[0] ?? null;
}

const LOCAL_SUPABASE_POSTGRES_URL =
  process.env.LOCAL_SUPABASE_DATABASE_URL?.trim() ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function isLocalSupabaseApiUrl(base: string): boolean {
  try {
    const u = new URL(base);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return (
      (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
      port === "54321"
    );
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(): string | null {
  const explicit =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (base && isLocalSupabaseApiUrl(base)) {
    return LOCAL_SUPABASE_POSTGRES_URL;
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password || !base) {
    return null;
  }

  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    return null;
  }

  if (!host.endsWith(".supabase.co")) {
    return null;
  }

  const ref = host.replace(/\.supabase\.co$/, "");
  if (!ref || ref.includes(".")) {
    return null;
  }

  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function ensurePlaceStatsFunctions(): Promise<void> {
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    console.warn(
      "[seed-fcpl-libraries] Cannot resolve Postgres URL for auto-fix. Set DATABASE_URL, or " +
        "SUPABASE_DB_PASSWORD with a hosted *.supabase.co URL, or use local Supabase (API URL on :54321).",
    );
    return;
  }

  const sqlPath = path.join(
    process.cwd(),
    "scripts/sql/create-place-stats-trigger.sql",
  );
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing SQL fix file: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, "utf-8");
  const statements = sql
    .split(/\n(?=CREATE OR REPLACE FUNCTION)/)
    .map((s) => s.trim())
    .filter((s) => s.toUpperCase().startsWith("CREATE OR REPLACE FUNCTION"));

  const client = new Client({
    connectionString: dbUrl,
    ssl: /localhost|127\.0\.0\.1/.test(dbUrl)
      ? undefined
      : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    for (const stmt of statements) {
      await client.query(stmt);
    }
    console.log(
      "Applied place_stats trigger functions (tables_plentiful; no tables_ideal).",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Failed to apply scripts/sql/create-place-stats-trigger.sql via Postgres: ${msg}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function fetchExistingIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("places")
      .select("google_place_id")
      .in("google_place_id", chunk);

    if (error) {
      throw new Error(`Failed to read existing places: ${error.message}`);
    }

    for (const row of data ?? []) {
      const id = (row as { google_place_id: string | null }).google_place_id;
      if (id) {
        existing.add(id);
      }
    }
  }

  return existing;
}

async function main(): Promise<void> {
  const rowsByGoogleId = new Map<string, PlaceRow>();
  const warnings: string[] = [];

  console.log(
    `Resolving ${FCPL_BRANCH_TEXT_QUERIES.length} FCPL branches via Places searchText…`,
  );

  for (let i = 0; i < FCPL_BRANCH_TEXT_QUERIES.length; i++) {
    const q = FCPL_BRANCH_TEXT_QUERIES[i];
    const data = await searchTextOnce(q);
    const picked = pickLibraryFromResults(data.places);
    if (!picked) {
      warnings.push(`No results for query: ${q}`);
      console.warn(`  [${i + 1}/${FCPL_BRANCH_TEXT_QUERIES.length}] NO RESULT: ${q}`);
      continue;
    }

    if (!isLibraryPlaceType(picked)) {
      warnings.push(
        `First match for "${q}" may not be a library: ${picked.displayName?.text ?? picked.id}`,
      );
    }

    const row = mapPlaceToRow(picked, "library");
    if (!row) {
      warnings.push(`Could not map place for: ${q}`);
      continue;
    }

    if (!rowsByGoogleId.has(row.google_place_id)) {
      rowsByGoogleId.set(row.google_place_id, row);
    }

    console.log(
      `  [${i + 1}/${FCPL_BRANCH_TEXT_QUERIES.length}] ${row.name} | ${row.google_place_id}`,
    );

    await sleep(400);
  }

  const rows = [...rowsByGoogleId.values()];
  console.log(`\nUnique FCPL places resolved: ${rows.length}`);

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (rows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: checking DB for missing google_place_ids…");
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const ids = rows.map((r) => r.google_place_id);
      const existing = await fetchExistingIds(supabase, ids);
      const missing = rows.filter((r) => !existing.has(r.google_place_id));
      const already = rows.length - missing.length;
      console.log(`  Already in DB: ${already}`);
      console.log(`  Would insert (new): ${missing.length}`);
      for (const row of missing) {
        console.log(
          `    + [library] ${row.name} | ${row.google_place_id} | ${row.address}`,
        );
      }
    } else {
      console.log(
        "  (Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to compare against DB in dry-run.)",
      );
      for (const row of rows) {
        console.log(
          `    [library] ${row.name} | ${row.google_place_id} | ${row.address}`,
        );
      }
    }
    console.log("\n--dry-run: no Supabase writes.");
    return;
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  await ensurePlaceStatsFunctions();

  const ids = rows.map((r) => r.google_place_id);
  const existingBefore = await fetchExistingIds(supabase, ids);

  let newCount = 0;
  let existedCount = 0;
  for (const row of rows) {
    if (existingBefore.has(row.google_place_id)) {
      existedCount++;
    } else {
      newCount++;
    }
  }

  const batchSize = 80;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("places").upsert(chunk, {
      onConflict: "google_place_id",
    });
    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`  New places (not in DB before this run): ${newCount}`);
  console.log(`  Already existed (upserted / updated): ${existedCount}`);
  console.log(`  Total rows upserted: ${rows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
