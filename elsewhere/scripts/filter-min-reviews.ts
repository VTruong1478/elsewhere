/**
 * For each existing row in public.places with a google_place_id, fetches Place Details (New)
 * and sets is_active = false when Google user review total is below MIN_USER_RATINGS.
 *
 * Does not insert or upsert places. Rows without google_place_id are skipped.
 *
 * API: GET https://places.googleapis.com/v1/places/{place_id}
 * Header X-Goog-FieldMask: userRatingCount
 * (Places API New: userRatingCount is the legacy user_ratings_total field.)
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/filter-min-reviews.ts
 *   npx ts-node scripts/filter-min-reviews.ts --dry-run
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

const MIN_USER_RATINGS = 200;

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

function toPlacePathId(googlePlaceId: string): string | null {
  const s = googlePlaceId.trim();
  if (!s) return null;
  const id = s.startsWith("places/") ? s.slice("places/".length) : s;
  return id || null;
}

interface PlaceDetailsResponse {
  userRatingCount?: number;
}

async function fetchUserRatingCount(
  googlePlaceId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const placeId = toPlacePathId(googlePlaceId);
  if (!placeId) {
    return { ok: false, error: "empty google_place_id" };
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "userRatingCount",
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
  const count = data.userRatingCount ?? 0;

  return { ok: true, count };
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
      .not("google_place_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Supabase places select: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  console.log(
    `Loaded ${rows.length} places with google_place_id (min reviews: ${MIN_USER_RATINGS}).${DRY_RUN ? " (--dry-run)" : ""}`,
  );

  let skippedNoId = 0;
  let apiErrors = 0;
  let kept = 0;
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

    if (apiIndex > 0 && REQUEST_GAP_MS > 0) {
      await sleep(REQUEST_GAP_MS);
    }
    apiIndex++;

    const result = await fetchUserRatingCount(gid!);

    if (!result.ok) {
      apiErrors++;
      console.warn(`  [skip] ${row.name} | ${result.error}`);
      continue;
    }

    const { count } = result;
    if (count >= MIN_USER_RATINGS) {
      kept++;
      continue;
    }

    if (!row.is_active) {
      alreadyInactive++;
      continue;
    }

    if (DRY_RUN) {
      wouldDeactivate++;
      console.log(
        `  [dry-run would deactivate] ${row.name} | userRatingCount=${count} (<${MIN_USER_RATINGS})`,
      );
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
    console.log(
      `  [deactivated] ${row.name} | userRatingCount=${count}`,
    );
  }

  console.log("\nSummary:");
  console.log(`  Places with google_place_id: ${rows.length}`);
  console.log(`  Skipped (empty id after trim): ${skippedNoId}`);
  console.log(`  Kept (${MIN_USER_RATINGS}+ reviews): ${kept}`);
  console.log(`  Already inactive (< ${MIN_USER_RATINGS} reviews): ${alreadyInactive}`);
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
