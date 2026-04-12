/**
 * Single place for "where to go after login / signup / OAuth callback".
 * Rate URLs get `from_auth=1` so place detail can adjust back navigation (see rate page).
 */

const RATE_PATH_RE = /^\/places\/[^/]+\/rate(?:\/|$)/;

/**
 * @param nextPath - Sanitized internal path from `safeInternalPath`, or null for default feed.
 */
export function destinationAfterAuth(nextPath: string | null | undefined): string {
  const base =
    nextPath != null && String(nextPath).trim() !== ""
      ? String(nextPath).trim()
      : "/feed";
  if (!RATE_PATH_RE.test(base)) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from_auth=1`;
}
