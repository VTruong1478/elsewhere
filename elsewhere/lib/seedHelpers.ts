/**
 * Shared helpers for scripts/seed-nova-ratings.ts.
 * Exported so they can be unit-tested without importing the script itself.
 */

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
    // input alias (scarce is an outlets value; map to limited)
    scarce: "limited",
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
