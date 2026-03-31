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

function deriveAvatarUrlFromAuthUser(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  return m
    ? pickString(m.avatar_url) ?? pickString(m.picture) ?? null
    : null;
}

/**
 * Ensures profile identity fields are present after auth callback.
 * - `full_name` powers public note author labels.
 * - `avatar_url` powers profile avatar UI.
 */
export async function ensureProfileFullName(
  service: SupabaseClient,
  user: User,
): Promise<void> {
  const derivedFullName = deriveFullNameFromAuthUser(user);
  const derivedAvatarUrl = deriveAvatarUrlFromAuthUser(user);

  if (!derivedFullName && !derivedAvatarUrl) {
    return;
  }

  const { data: row, error: selectError } = await service
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[ensureProfileFullName] select error:", selectError);
    return;
  }

  const currentFullName = pickString(row?.full_name);
  const currentAvatar = pickString(row?.avatar_url);

  const updates: { full_name?: string; avatar_url?: string; updated_at?: string } = {};
  if (!currentFullName && derivedFullName) {
    updates.full_name = derivedFullName;
  }
  if (!currentAvatar && derivedAvatarUrl) {
    updates.avatar_url = derivedAvatarUrl;
  }

  if (row) {
    if (Object.keys(updates).length === 0) {
      return;
    }

    updates.updated_at = new Date().toISOString();
    const { error } = await service
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
    if (error) {
      console.error("[ensureProfileFullName] update error:", error);
    }
    return;
  }

  const insertPayload: { id: string; full_name?: string; avatar_url?: string } = {
    id: user.id,
  };
  if (derivedFullName) insertPayload.full_name = derivedFullName;
  if (derivedAvatarUrl) insertPayload.avatar_url = derivedAvatarUrl;

  const { error: insertError } = await service
    .from("profiles")
    .insert(insertPayload);

  if (insertError?.code === "23505") {
    if (Object.keys(updates).length === 0) {
      return;
    }

    updates.updated_at = new Date().toISOString();
    const { error: upd } = await service
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
    if (upd) console.error("[ensureProfileFullName] update after race:", upd);
  } else if (insertError) {
    console.error("[ensureProfileFullName] insert error:", insertError);
  }
}
