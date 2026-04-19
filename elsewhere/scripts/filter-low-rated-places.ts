/**
 * For each existing row in public.places, fetches Place Details (New) and sets
 * is_active = false when either:
 *   - Google review total (user_ratings_total / userRatingCount) < 100, or
 *   - any entry in Google's types[] contains "restaurant", "food", or "kitchen" (case-insensitive).
 *
 * Name whitelist (never deactivated): Starbucks, Peet's Coffee, Paris Baguette, Tous les Jours
 * (also "tou les jours"), Minara Cafe @ DAH, Midori Tea House, Panera Bread, library, and any name
 * containing "cafe"/"café", or coffee, bakery, tea, bake, or bubble (accent normalized).
 *
 * Whitelisted rows skip the Google API call.
 *
 * Does not insert or upsert places — only reads places and updates is_active.
 * Rows without google_place_id are skipped.
 *
 * API: GET https://places.googleapis.com/v1/places/{place_id}
 * Header X-Goog-FieldMask: userRatingCount,types
 * (Places API New uses camelCase; user_ratings_total in legacy docs = userRatingCount.)
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/filter-low-rated-places.ts
 *   npx ts-node scripts/filter-low-rated-places.ts --dry-run
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

const MIN_USER_RATINGS = 100;

/** If any Google type string contains these substrings, the place is deactivated. */
const EXCLUDED_TYPE_SUBSTRINGS = ["restaurant", "food", "kitchen"] as const;

/**
 * Substrings matched against a normalized place name (case- and accent-insensitive;
 * apostrophes removed). Also whitelisted if normalized name includes "cafe"
 * (covers "café") or any of NAME_WHITELIST_SUBSTRINGS (coffee, bakery, tea, bake, bubble).
 */
const NAME_WHITELIST_PHRASES = [
  "starbucks",
  "peets coffee",
  "paris baguette",
  "tous les jours",
  "tou les jours",
  "minara cafe",
  "midori tea house",
  "panera bread",
  "library",
] as const;

const NAME_WHITELIST_SUBSTRINGS = [
  "coffee",
  "bakery",
  "tea",
  "bake",
  "bubble",
] as const;

/** Delay between Google API calls to reduce burst quota issues */
const REQUEST_GAP_MS = 120;

if (!GOOGLE_PLACES_API_KEY) {
  throw new Error("GOOGLE_PLACES_API_KEY is required in .env.local");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ChIJ… only, for /v1/places/{id} path (handles stored ids with or without `places/`). */
function toPlacePathId(googlePlaceId: string): string | null {
  const s = googlePlaceId.trim();
  if (!s) return null;
  const id = s.startsWith("places/") ? s.slice("places/".length) : s;
  return id || null;
}

/** Lowercase ASCII; strips combining marks (café → cafe); strips ASCII/curly apostrophes. */
function normalizePlaceNameForWhitelist(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2019']/g, "")
    .toLowerCase();
}

function isWhitelistedByName(name: string): boolean {
  const n = normalizePlaceNameForWhitelist(name);
  if (n.includes("cafe")) {
    return true;
  }
  for (const sub of NAME_WHITELIST_SUBSTRINGS) {
    if (n.includes(sub)) {
      return true;
    }
  }
  for (const phrase of NAME_WHITELIST_PHRASES) {
    if (n.includes(phrase)) {
      return true;
    }
  }
  return false;
}

function matchesExcludedPlaceTypes(types: string[] | undefined): boolean {
  if (!types?.length) return false;
  for (const t of types) {
    const lower = t.toLowerCase();
    for (const sub of EXCLUDED_TYPE_SUBSTRINGS) {
      if (lower.includes(sub)) return true;
    }
  }
  return false;
}

interface PlaceDetailsResponse {
  /** Places API (New); legacy Details field user_ratings_total */
  userRatingCount?: number;
  types?: string[];
}

async function fetchPlaceDetailsForFilter(
  googlePlaceId: string,
): Promise<
  | { ok: true; userRatingCount: number; types: string[] }
  | { ok: false; error: string }
> {
  const placeId = toPlacePathId(googlePlaceId);
  if (!placeId) {
    return { ok: false, error: "empty google_place_id" };
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      // Request user_ratings_total equivalent + types (New API names).
      "X-Goog-FieldMask": "userRatingCount,types",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  const data = (await res.json()) as PlaceDetailsResponse;
  const userRatingCount = data.userRatingCount ?? 0;
  const types = Array.isArray(data.types) ? data.types : [];

  return { ok: true, userRatingCount, types };
}

function shouldDeactivate(
  userRatingCount: number,
  types: string[],
): { deactivate: boolean; lowReviews: boolean; excludedTypes: boolean } {
  const lowReviews = userRatingCount < MIN_USER_RATINGS;
  const excludedTypes = matchesExcludedPlaceTypes(types);
  return {
    deactivate: lowReviews || excludedTypes,
    lowReviews,
    excludedTypes,
  };
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const pageSize = 500;
  let from = 0;
  const rows: Array<{
    id: string;
    google_place_id: string | null;
    name: string;
    is_active: boolean | null;
  }> = [];

  for (;;) {
    const { data, error } = await supabase
      .from("places")
      .select("id, google_place_id, name, is_active")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Supabase places select: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  console.log(
    `Loaded ${rows.length} existing places from DB.${DRY_RUN ? " (--dry-run)" : ""}`,
  );

  let skippedNoId = 0;
  let apiErrors = 0;
  let unchangedOk = 0;
  let whitelistKept = 0;
  let alreadyInactive = 0;
  let deactivated = 0;
  let wouldDeactivate = 0;

  let apiIndex = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const gid = row.google_place_id;

    if (!toPlacePathId(gid ?? "")) {
      skippedNoId++;
      continue;
    }

    if (isWhitelistedByName(row.name)) {
      whitelistKept++;
      unchangedOk++;
      continue;
    }

    if (apiIndex > 0 && REQUEST_GAP_MS > 0) {
      await sleep(REQUEST_GAP_MS);
    }
    apiIndex++;

    const result = await fetchPlaceDetailsForFilter(gid!);

    if (!result.ok) {
      apiErrors++;
      console.warn(`  [skip] ${row.name} | ${result.error}`);
      continue;
    }

    const { userRatingCount, types } = result;
    const { deactivate, lowReviews, excludedTypes } = shouldDeactivate(
      userRatingCount,
      types,
    );

    if (!deactivate) {
      unchangedOk++;
      continue;
    }

    if (!row.is_active) {
      alreadyInactive++;
      console.log(
        `  [already inactive] ${row.name} | reviews=${userRatingCount} types=${types.slice(0, 5).join(",")}${types.length > 5 ? "…" : ""}`,
      );
      continue;
    }

    const reasons = [
      lowReviews ? `reviews=${userRatingCount} (<${MIN_USER_RATINGS})` : null,
      excludedTypes
        ? `types hit [${EXCLUDED_TYPE_SUBSTRINGS.join("|")}]`
        : null,
    ]
      .filter(Boolean)
      .join("; ");

    if (DRY_RUN) {
      wouldDeactivate++;
      console.log(`  [dry-run would deactivate] ${row.name} | ${reasons}`);
      continue;
    }

    const { error: updateErr } = await supabase
      .from("places")
      .update({ is_active: false })
      .eq("id", row.id);

    if (updateErr) {
      apiErrors++;
      console.warn(`  [update failed] ${row.name}: ${updateErr.message}`);
      continue;
    }

    deactivated++;
    console.log(`  [deactivated] ${row.name} | ${reasons}`);
  }

  console.log("\nSummary:");
  console.log(`  Places in DB: ${rows.length}`);
  console.log(`  Skipped (no google_place_id): ${skippedNoId}`);
  console.log(
    `  Unchanged: ${unchangedOk} (includes ${whitelistKept} name whitelist; no API)`,
  );
  console.log(`  Already inactive (would match rules): ${alreadyInactive}`);
  if (DRY_RUN) {
    console.log(`  Would set is_active=false: ${wouldDeactivate}`);
  } else {
    console.log(`  Set is_active=false: ${deactivated}`);
  }
  console.log(`  API / update errors: ${apiErrors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
