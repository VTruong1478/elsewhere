import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// generates a clean unique username from a display name or email prefix
// - lowercases the input
// - removes all characters except letters, numbers, underscores
// - strips leading/trailing underscores
// - truncates to 20 chars
// - checks profiles table for availability
// - appends incrementing number if taken (e.g. antruong1, antruong2)
// - uses service role client for the uniqueness check
export function deriveUsernameBase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export async function generateUsername(
  service: SupabaseClient,
  input: string,
  excludeUserId?: string,
): Promise<string> {
  const base = deriveUsernameBase(input) || "user";

  async function isTaken(candidate: string): Promise<boolean> {
    let query = service
      .from("profiles")
      .select("id")
      .eq("username", candidate);
    if (excludeUserId) query = query.neq("id", excludeUserId);
    const { data } = await query.maybeSingle();
    return data !== null;
  }

  const initial = base.slice(0, 20);
  if (!(await isTaken(initial))) return initial;

  for (let i = 1; i <= 999; i++) {
    const suffix = String(i);
    const truncated = base.slice(0, 20 - suffix.length);
    const attempt = `${truncated}${suffix}`;
    if (!(await isTaken(attempt))) return attempt;
  }

  // Extremely unlikely fallback
  return `${base.slice(0, 14)}${Date.now().toString().slice(-6)}`;
}
