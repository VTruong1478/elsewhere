import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Prefer OAuth / signup metadata; fall back to email local-part (matches profile page UX). */
export function deriveFullNameFromAuthUser(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    (m && (pickString(m.full_name) ?? pickString(m.name))) ?? null;
  if (full) return full;

  const given = m ? pickString(m.given_name) : null;
  const family = m ? pickString(m.family_name) : null;
  if (given && family) return `${given} ${family}`;
  if (given) return given;

  const email = user.email;
  if (email?.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
}

/**
 * Ensures `profiles.full_name` is set when the DB row exists but name is empty.
 * `place_notes_public` joins on `profiles.full_name`; without it, notes show as "Anonymous".
 */
export async function ensureProfileFullName(
  service: SupabaseClient,
  user: User,
): Promise<void> {
  const derived = deriveFullNameFromAuthUser(user);
  if (!derived) return;

  const { data: row, error: selectError } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[ensureProfileFullName] select error:", selectError);
    return;
  }

  if (row?.full_name && String(row.full_name).trim() !== "") {
    return;
  }

  if (row) {
    const { error } = await service
      .from("profiles")
      .update({ full_name: derived, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      console.error("[ensureProfileFullName] update error:", error);
    }
    return;
  }

  const { error: insertError } = await service
    .from("profiles")
    .insert({ id: user.id, full_name: derived });

  if (insertError?.code === "23505") {
    const { error: upd } = await service
      .from("profiles")
      .update({ full_name: derived, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (upd) console.error("[ensureProfileFullName] update after race:", upd);
  } else if (insertError) {
    console.error("[ensureProfileFullName] insert error:", insertError);
  }
}
