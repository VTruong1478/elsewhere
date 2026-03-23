/**
 * Places use Postgres uuid ids. Reject empty / literal "undefined" / non-uuid strings
 * so we never call GET /api/places/[id] with a bad segment (404 "Place not found").
 */
const PLACE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePlaceId(
  id: string | null | undefined,
): string | null {
  if (id == null) return null;
  const s = String(id).trim();
  if (s === "" || s === "undefined") return null;
  if (!PLACE_UUID_RE.test(s)) return null;
  return s.toLowerCase();
}

/** Store normalizes ids to lowercase; feed/API may return mixed-case uuids. */
export function samePlaceId(a: string | null, b: string) {
  if (a == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}
