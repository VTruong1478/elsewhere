/**
 * Client-only: true when the dev bypass cookie is set (matches server
 * `hasDevBypassCookie` in dev). Used when there is no Supabase session on the
 * client but the app still shows the dev user on server-rendered pages.
 * Does not gate on NODE_ENV so local `next start` still matches cookie behavior.
 */
export function hasDevBypassCookieClient(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith("dev_auth=1"));
}
