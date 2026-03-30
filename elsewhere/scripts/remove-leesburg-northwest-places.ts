/**
 * Deletes rows from public.places that are either:
 *   1) Within LEESBURG_AREA_RADIUS_MILES of downtown Leesburg, VA (“Leesburg area”), or
 *   2) Strictly north AND west of that center (lat > center, lng < center — NW quadrant in map coords).
 *
 * Does not insert places. Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Run from the elsewhere app directory:
 *   npx ts-node scripts/remove-leesburg-northwest-places.ts
 *   npx ts-node scripts/remove-leesburg-northwest-places.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Downtown Leesburg, VA (approx.) — edit if you need a different anchor. */
const LEESBURG_CENTER_LAT = 39.1157;
const LEESBURG_CENTER_LNG = -77.5636;

/**
 * Radius around the center counted as “Leesburg area” (miles).
 * Smaller values avoid pulling in Ashburn-style eastern suburbs; increase if needed.
 */
const LEESBURG_AREA_RADIUS_MILES = 10;

const EARTH_RADIUS_MILES = 3958.8;

const BATCH = 150;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local",
  );
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Haversine distance in miles. */
function milesApart(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rlat1 = (lat1 * Math.PI) / 180;
  const rlat2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

function matchesRemoveZone(
  lat: number,
  lng: number,
):
  | { remove: true; reason: "leesburg_area" | "northwest_of_leesburg" | "both" }
  | { remove: false } {
  const dist = milesApart(lat, lng, LEESBURG_CENTER_LAT, LEESBURG_CENTER_LNG);
  const inArea = dist <= LEESBURG_AREA_RADIUS_MILES;
  const nw = lat > LEESBURG_CENTER_LAT && lng < LEESBURG_CENTER_LNG;

  if (inArea && nw) return { remove: true, reason: "both" };
  if (inArea) return { remove: true, reason: "leesburg_area" };
  if (nw) return { remove: true, reason: "northwest_of_leesburg" };
  return { remove: false };
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const pageSize = 500;
  let from = 0;
  const rows: Array<{
    id: string;
    name: string;
    lat: unknown;
    lng: unknown;
  }> = [];

  for (;;) {
    const { data, error } = await supabase
      .from("places")
      .select("id, name, lat, lng")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Supabase select: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const targets: Array<{
    id: string;
    name: string;
    reason: "leesburg_area" | "northwest_of_leesburg" | "both";
  }> = [];

  for (const row of rows) {
    const lat = toNumber(row.lat);
    const lng = toNumber(row.lng);
    if (lat == null || lng == null) continue;

    const hit = matchesRemoveZone(lat, lng);
    if (hit.remove) {
      targets.push({ id: row.id, name: row.name, reason: hit.reason });
    }
  }

  console.log(`Loaded ${rows.length} places.`);
  console.log(
    `Leesburg anchor: (${LEESBURG_CENTER_LAT}, ${LEESBURG_CENTER_LNG}), area radius ${LEESBURG_AREA_RADIUS_MILES} mi.`,
  );
  console.log(
    `NW rule: lat > ${LEESBURG_CENTER_LAT} AND lng < ${LEESBURG_CENTER_LNG}.`,
  );
  console.log(`Matched for removal: ${targets.length}.${DRY_RUN ? " (--dry-run)" : ""}`);

  const byReason: Record<
    "leesburg_area" | "northwest_of_leesburg" | "both",
    number
  > = {
    leesburg_area: 0,
    northwest_of_leesburg: 0,
    both: 0,
  };
  for (const t of targets) {
    byReason[t.reason]++;
  }
  console.log(
    `  By reason: leesburg_area=${byReason.leesburg_area}, nw=${byReason.northwest_of_leesburg}, both=${byReason.both}`,
  );

  for (const t of targets.slice(0, 25)) {
    console.log(`  → [${t.reason}] ${t.name}`);
  }
  if (targets.length > 25) {
    console.log(`  … +${targets.length - 25} more`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: no deletes.");
    return;
  }

  const ids = targets.map((t) => t.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { error } = await supabase.from("places").delete().in("id", chunk);
    if (error) {
      throw new Error(`Delete batch failed: ${error.message}`);
    }
    deleted += chunk.length;
  }

  console.log(`\nDeleted ${deleted} places.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
