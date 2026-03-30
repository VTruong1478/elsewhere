/**
 * Prevent open redirects: only allow same-origin relative paths.
 */
export function safeInternalPath(
  next: string | null | undefined,
): string | null {
  if (next == null || next === "") return null;
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  return t;
}
