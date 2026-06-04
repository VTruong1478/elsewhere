import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getDevAuthCredentials, getOrCreateDevAuthUser } from "@/lib/devAuth";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const credentials = getDevAuthCredentials();

  if (
    !credentials ||
    email !== credentials.email ||
    password !== credentials.password
  ) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Ensure the dev test account exists in Supabase Auth so gated API writes
  // can attach to a stable real user id.
  const serviceClient = createServiceRoleClient();
  await getOrCreateDevAuthUser(serviceClient);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("dev_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
