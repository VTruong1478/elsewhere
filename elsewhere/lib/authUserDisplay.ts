import type { User } from "@supabase/supabase-js";

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** True when the user signed in with Google (OAuth identity or primary provider). */
export function isGoogleAuthUser(user: User): boolean {
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  const providers = meta?.providers;
  if (Array.isArray(providers) && providers.includes("google")) return true;
  if (meta?.provider === "google") return true;
  return user.identities?.some((i) => i.provider === "google") ?? false;
}

/** Avatar URL from OAuth metadata (Google uses `picture`). */
export function getOAuthAvatarUrl(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  if (!m) return null;
  return pickString(m.avatar_url) ?? pickString(m.picture) ?? null;
}

/**
 * First name for header: Google `given_name`, else first word of full name / name,
 * else email local-part (matches profile fallbacks).
 */
export function getHeaderFirstName(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const given = m ? pickString(m.given_name) : null;
  if (given) return given;

  const full = m ? pickString(m.full_name) ?? pickString(m.name) : null;
  if (full) {
    const first = full.split(/\s+/)[0];
    return first || null;
  }

  const email = user.email;
  if (email?.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
}
