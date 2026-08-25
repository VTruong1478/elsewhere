/**
 * WiFi and bathroom — the two optional rating attributes.
 *
 * Both are deliberately absent-able: a place nobody has answered for stays
 * `null` rather than being coerced to a value, so the UI can say "unknown"
 * instead of implying a bad one.
 */
export type WifiLevel = "none" | "works" | "fast";
export type BathroomAccess = "open" | "key" | "none";

type WifiCounts = {
  wifi_none: number | bigint;
  wifi_works: number | bigint;
  wifi_fast: number | bigint;
};

type BathroomCounts = {
  bathroom_open: number | bigint;
  bathroom_key: number | bigint;
  bathroom_none: number | bigint;
};

function n(v: number | bigint | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

/**
 * Most-reported value, or `null` when nobody has answered.
 *
 * Ties break toward the *more cautious* answer rather than the middle: if
 * opinion is split between "fast" and "works", say "works"; between "works" and
 * "none", say "none". Overstating connectivity is the failure that actually
 * costs someone a wasted trip. This is the one place it deliberately differs
 * from `dominantNoiseFromCounts` and friends, which break ties to the middle.
 */
export function dominantWifi(counts: WifiCounts): WifiLevel | null {
  const none = n(counts.wifi_none);
  const works = n(counts.wifi_works);
  const fast = n(counts.wifi_fast);
  const max = Math.max(none, works, fast);
  if (max === 0) return null;
  if (none === max) return "none";
  if (works === max) return "works";
  return "fast";
}

/** Same cautious tie-break: the harder-to-access answer wins. */
export function dominantBathroom(
  counts: BathroomCounts,
): BathroomAccess | null {
  const open = n(counts.bathroom_open);
  const key = n(counts.bathroom_key);
  const none = n(counts.bathroom_none);
  const max = Math.max(open, key, none);
  if (max === 0) return null;
  if (none === max) return "none";
  if (key === max) return "key";
  return "open";
}

/** Detail-page wording. Card shows an icon only, so it has no entry here. */
export const WIFI_DETAIL_LABEL: Record<WifiLevel, string> = {
  fast: "Fast & reliable WiFi",
  works: "WiFi works",
  none: "No WiFi",
};

export const BATHROOM_DETAIL_LABEL: Record<BathroomAccess, string> = {
  open: "Bathroom — open to all",
  key: "Bathroom — key or code required",
  none: "No bathroom",
};

/** Accessible name for the card's wifi icon, including the unknown case. */
export function wifiCardLabel(wifi: WifiLevel | null): string {
  if (wifi === "none") return "No WiFi";
  if (wifi == null) return "WiFi unknown";
  return "Has WiFi";
}
