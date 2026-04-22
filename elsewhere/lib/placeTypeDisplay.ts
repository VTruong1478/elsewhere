/**
 * Human-readable place type for UI (snake_case / odd separators → words).
 * Tea shops use sentence-style "Tea shop" (lowercase s).
 */
export function formatPlaceTypeForDisplay(
  placeType: string | null | undefined,
): string {
  const raw = (placeType ?? "").normalize("NFKC").trim();
  if (!raw) return "Spot";

  const normalized = raw
    .toLowerCase()
    // spaces, ASCII/unicode dashes, underscore variants → single _
    .replace(/[\s_\-–—−ｰ\u2010\u2011\u2012\u2013\u2014\u2212\uFF3F]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!normalized) return "Spot";
  if (normalized === "tea_shop" || normalized === "tea_shops") {
    return "Tea shop";
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map(
      (word) =>
        word.length === 0
          ? ""
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
