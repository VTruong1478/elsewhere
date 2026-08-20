import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  hasDevBypassCookie,
  tryGetOrCreateDevAuthUser,
} from "@/lib/devAuth";
import {
  validateFullName,
  validateUsername,
} from "@/lib/constants/profile";

/** Postgres unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * PATCH /api/user/profile — update the signed-in user's own profile.
 *
 * The edit modals used to write `profiles` straight from the browser with the
 * anon client, which skipped validation and surfaced raw Postgres errors to
 * users. The target row is always derived from the session, never from the body.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (hasDevBypassCookie(cookieStore)
      ? await tryGetOrCreateDevAuthUser(serviceClient, "user/profile")
      : null);

  if (!actingUser) {
    return NextResponse.json(
      { data: null, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    username?: unknown;
    full_name?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const updates: Record<string, string> = {};

  if (Object.prototype.hasOwnProperty.call(body, "username")) {
    if (typeof body.username !== "string") {
      return NextResponse.json(
        { data: null, error: "Username must be text" },
        { status: 400 },
      );
    }
    const username = body.username.trim().toLowerCase();
    const invalid = validateUsername(username);
    if (invalid) {
      return NextResponse.json({ data: null, error: invalid }, { status: 400 });
    }
    updates.username = username;
  }

  if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
    if (typeof body.full_name !== "string") {
      return NextResponse.json(
        { data: null, error: "Name must be text" },
        { status: 400 },
      );
    }
    const fullName = body.full_name.trim();
    const invalid = validateFullName(fullName);
    if (invalid) {
      return NextResponse.json({ data: null, error: invalid }, { status: 400 });
    }
    updates.full_name = fullName;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { data: null, error: "Nothing to update" },
      { status: 400 },
    );
  }

  const { data: updated, error } = await serviceClient
    .from("profiles")
    .update(updates)
    .eq("id", actingUser.id)
    .select("id, username, full_name, avatar_url")
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return NextResponse.json(
        { data: null, error: "That username is taken" },
        { status: 409 },
      );
    }
    console.error("[user/profile] update error:", error);
    return NextResponse.json(
      { data: null, error: "Failed to update profile" },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      { data: null, error: "Profile not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: updated, error: null });
}
