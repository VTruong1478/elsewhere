import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasDevBypassCookie, tryGetOrCreateDevAuthUser } from "@/lib/devAuth";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username") ?? "";

  if (!username || username.length > 20) {
    return NextResponse.json(
      { data: null, error: "Invalid username" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const cookieStore = await cookies();
  const devBypass = hasDevBypassCookie(cookieStore);
  const serviceClient = createServiceRoleClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actingUser =
    user ??
    (devBypass
      ? await tryGetOrCreateDevAuthUser(serviceClient, "username/check")
      : null);

  // Exclude the current user's own username so they can "save" without it flagging as taken
  let query = serviceClient
    .from("profiles")
    .select("id")
    .eq("username", username);

  if (actingUser) {
    query = query.neq("id", actingUser.id);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[username/check] error:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { available: data === null }, error: null });
}
