/** Human-readable place type for UI (e.g. tea_shop → Tea Shop). */
export function formatPlaceTypeForDisplay(
  placeType: string | null | undefined,
): string {
  const t = (placeType ?? "").trim().toLowerCase();
  if (!t) return "Spot";
  return t
    .split("_")
    .map(
      (word) =>
        word.length === 0
          ? ""
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
