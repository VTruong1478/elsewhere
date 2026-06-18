import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { generateUsername } from "@/lib/generateUsername";
import { deriveFullNameFromAuthUser } from "@/lib/ensureProfileFullName";

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function deriveUsernameInput(user: User): string | null {
  const fullName = deriveFullNameFromAuthUser(user);
  if (fullName) return fullName;
  const email = user.email;
  if (email?.includes("@")) return email.split("@")[0]?.trim() ?? null;
  return null;
}

/**
 * Ensures every profile has a username after auth callback.
 * - New user with no row: inserts a generated username (profile row should already exist from ensureProfileFullName).
 * - Returning user with no username: generates and updates.
 * - Returning user with a username: no-op.
 */
export async function ensureProfileUsername(
  service: SupabaseClient,
  user: User,
): Promise<void> {
  const { data: row, error: selectError } = await service
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[ensureProfileUsername] select error:", selectError);
    return;
  }

  if (pickString(row?.username)) return;

  const input = deriveUsernameInput(user);
  if (!input) return;

  const username = await generateUsername(service, input, user.id);

  if (row) {
    const { error } = await service
      .from("profiles")
      .update({ username, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) console.error("[ensureProfileUsername] update error:", error);
    return;
  }

  const { error: insertError } = await service
    .from("profiles")
    .insert({ id: user.id, username });

  if (insertError?.code === "23505") {
    const { error: upd } = await service
      .from("profiles")
      .update({ username, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (upd) console.error("[ensureProfileUsername] update after race:", upd);
  } else if (insertError) {
    console.error("[ensureProfileUsername] insert error:", insertError);
  }
}
