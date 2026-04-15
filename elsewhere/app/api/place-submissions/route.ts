import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deriveFullNameFromAuthUser } from "@/lib/ensureProfileFullName";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devBypass =
    process.env.NODE_ENV === "development" &&
    request.cookies.get("dev_auth")?.value === "1";

  let userId = user?.id ?? null;
  if (!userId) {
    if (!devBypass) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
  }

  let body: {
    place_name?: string;
    address_or_location?: string;
    place_type?: string;
    submitted_from_search?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const place_name = (body.place_name ?? "").trim();
  const address_or_location = (body.address_or_location ?? "").trim();
  const place_type = (body.place_type ?? "").trim();
  const submitted_from_search = (body.submitted_from_search ?? null)
    ? String(body.submitted_from_search).trim()
    : null;

  if (!place_name || !address_or_location || !place_type) {
    return NextResponse.json(
      {
        error:
          "place_name, address_or_location, and place_type are required",
      },
      { status: 400 },
    );
  }

  const serviceClient = createServiceRoleClient();
  if (!userId && devBypass) {
    // Dev bypass has no Supabase session user id. Reuse any existing profile id so
    // place_submissions.user_id FK (profiles.id -> auth.users.id) remains valid.
    const { data: profileRow, error: profileError } = await serviceClient
      .from("profiles")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (profileError || !profileRow?.id) {
      return NextResponse.json(
        {
          error:
            "Dev submit requires at least one real user profile. Log in once with real auth first.",
        },
        { status: 500 },
      );
    }
    userId = String(profileRow.id);
  }

  // Denormalized submitter info for easier moderation in table views.
  let submitterFullName: string | null = null;
  let submitterEmail: string | null = null;

  const { data: profileRow } = await serviceClient
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (typeof profileRow?.full_name === "string") {
    const trimmed = profileRow.full_name.trim();
    submitterFullName = trimmed.length > 0 ? trimmed : null;
  }

  if (user) {
    submitterEmail = user.email ?? null;
    if (!submitterFullName) {
      submitterFullName = deriveFullNameFromAuthUser(user);
    }
  } else if (userId) {
    const { data: adminUserData, error: adminUserError } =
      await serviceClient.auth.admin.getUserById(userId);
    if (!adminUserError) {
      submitterEmail = adminUserData.user?.email ?? null;
    }
  }

  const { error } = await serviceClient.from("place_submissions").insert({
    user_id: userId,
    place_name,
    address_or_location,
    place_type,
    submitted_from_search,
    submitter_full_name: submitterFullName,
    submitter_email: submitterEmail,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to submit place" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

