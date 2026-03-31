import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrCreateDevAuthUser } from "@/lib/devAuth";

const DEV_EMAIL = "test@example.com";
const DEV_PASSWORD = "testpass123";

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

  if (email !== DEV_EMAIL || password !== DEV_PASSWORD) {
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
