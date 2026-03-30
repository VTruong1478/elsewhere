/**
 * Seed public.places from Google Places API (New) Text Search — Northern Virginia.
 *
 * Uses searchText (not legacy Text Search JSON), which matches typical Cloud Console
 * enablement for new projects.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/seed-places.ts
 *   npx ts-node scripts/seed-places.ts --dry-run
 *
 * ENV (.env.local): GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * Inserts only write `places`. New rows fire `create_place_stats_on_place_insert`, which
 * must use `place_stats` columns `tables_limited`, `tables_mixed`, and `tables_plentiful`
 * (not `tables_ideal`).
 *
 * Auto-fix: set any of `DATABASE_URL`, `DIRECT_URL`, or `SUPABASE_DB_PASSWORD` (with
 * `NEXT_PUBLIC_SUPABASE_URL` pointing at `*.supabase.co`) so this script runs
 * `scripts/sql/create-place-stats-trigger.sql` before upsert. The password is the
 * same as Supabase → Project Settings → Database → Database password.
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

const SEARCH_TEXT_URL =
  "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.photos",
  "places.currentOpeningHours",
  "places.primaryType",
  "places.types",
  "nextPageToken",
].join(",");

const NOVA_AREAS = [
  "Arlington VA",
  "Alexandria VA",
  "Fairfax VA",
  "Reston VA",
  "McLean VA",
  "Herndon VA",
  "Falls Church VA",
  "Sterling VA",
  "Ashburn VA",
  "Leesburg VA",
] as const;

type PlaceType = "cafe" | "library";

interface SearchSpec {
  query: string;
  placeType: PlaceType;
}

function buildSearchSpecs(): SearchSpec[] {
  const broad: SearchSpec[] = [
    { query: "cafes in Northern Virginia", placeType: "cafe" },
    { query: "coffee shops in Northern Virginia", placeType: "cafe" },
    { query: "public libraries in Northern Virginia", placeType: "library" },
  ];

  const perArea: SearchSpec[] = NOVA_AREAS.flatMap((area) => [
    { query: `cafes in ${area}`, placeType: "cafe" as const },
    { query: `coffee shops in ${area}`, placeType: "cafe" as const },
    { query: `public libraries in ${area}`, placeType: "library" as const },
  ]);

  return [...broad, ...perArea];
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
  primaryType?: string;
  types?: string[];
}

interface SearchTextResponse {
  places?: PlaceResource[];
  nextPageToken?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Round to exactly 7 decimal places (numeric scale for lat/lng). */
function roundCoord7(n: number): number {
  return Math.round(n * 10_000_000) / 10_000_000;
}

async function searchTextOnce(
  textQuery: string,
  pageToken?: string,
): Promise<SearchTextResponse> {
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 20,
  };
  if (pageToken) {
    body.pageToken = pageToken;
  }

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

/** Up to 60 results per query (3 pages × 20); 2s delay before each page after the first. */
async function searchTextAllPages(textQuery: string): Promise<PlaceResource[]> {
  const out: PlaceResource[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 3; page++) {
    if (page > 0) {
      await sleep(2000);
      if (!nextToken) {
        break;
      }
    }

    let data = await searchTextOnce(textQuery, nextToken);

    if (!data.places?.length && nextToken && page > 0) {
      await sleep(2000);
      data = await searchTextOnce(textQuery, nextToken);
    }

    out.push(...(data.places ?? []));
    nextToken = data.nextPageToken;
    if (!nextToken) {
      break;
    }
  }

  return out;
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
  if (latRaw == null || lngRaw == null || Number.isNaN(latRaw) || Number.isNaN(lngRaw)) {
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

/** Default Postgres URL when using `supabase start` (API on :54321, DB on :54322). */
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

/** Direct Postgres URL: explicit env, local `supabase start`, or hosted project. */
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

/** Applies create_place_stats + update_place_stats SQL (no tables_ideal). */
async function ensurePlaceStatsFunctions(): Promise<void> {
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    console.warn(
      "[seed-places] Cannot resolve Postgres URL for auto-fix. Set DATABASE_URL, or " +
        "SUPABASE_DB_PASSWORD with a hosted *.supabase.co URL, or use local Supabase (API URL on :54321). " +
        "Alternatively run scripts/sql/create-place-stats-trigger.sql in the SQL Editor.",
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
      `Failed to apply scripts/sql/create-place-stats-trigger.sql via Postgres: ${msg}\n` +
        "Check DATABASE_URL / SUPABASE_DB_PASSWORD, or run that file in Supabase SQL Editor.",
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
  const specs = buildSearchSpecs();
  const byGoogleId = new Map<string, PlaceRow>();

  console.log(`Running ${specs.length} Text Search queries (up to 60 results each)…`);

  for (const spec of specs) {
    const results = await searchTextAllPages(spec.query);
    let added = 0;
    for (const r of results) {
      const row = mapPlaceToRow(r, spec.placeType);
      if (!row) {
        continue;
      }
      if (!byGoogleId.has(row.google_place_id)) {
        byGoogleId.set(row.google_place_id, row);
        added++;
      }
    }
    console.log(`  "${spec.query}" → ${results.length} raw, ${added} new unique ids`);
  }

  const rows = [...byGoogleId.values()];
  console.log(`\nUnique places after dedupe: ${rows.length}`);

  if (rows.length === 0) {
    console.log("Nothing to upsert.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: would upsert the following (sample up to 15):");
    for (const row of rows.slice(0, 15)) {
      console.log(
        `  [${row.place_type}] ${row.name} | ${row.google_place_id} | ${row.address}`,
      );
    }
    if (rows.length > 15) {
      console.log(`  … and ${rows.length - 15} more`);
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
      const msg = error.message;
      if (msg.includes("tables_ideal")) {
        throw new Error(
          `${msg}\n\n` +
            "The DB trigger create_place_stats_on_place_insert still references removed columns. " +
            "Fix: add DATABASE_URL to .env.local and re-run this script, or paste " +
            "scripts/sql/create-place-stats-trigger.sql into Supabase → SQL Editor → Run.",
        );
      }
      throw new Error(`Supabase upsert failed: ${msg}`);
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
