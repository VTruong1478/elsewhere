/**
 * Same-origin URL for objects in the `user-photos` storage bucket.
 *
 * `getPublicUrl()` uses NEXT_PUBLIC_SUPABASE_URL (often http://127.0.0.1:54321 in local
 * dev). Browsers on another device on the LAN resolve that host as the phone itself, so
 * images break. The app proxies these files via /api/storage/user-photos/...
 */
export function userPhotoProxyUrl(objectPath: string): string {
  const raw = objectPath.trim();
  if (!raw) return "";
  const key = raw.startsWith("user-photos/")
    ? raw.slice("user-photos/".length)
    : raw;
  if (!key) return "";
  return `/api/storage/user-photos/${key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}
