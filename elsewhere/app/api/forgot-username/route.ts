import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { email } = body as { email?: unknown };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { data: null, error: "Valid email is required" },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const serviceClient = createServiceRoleClient();

    const { data: usersData, error: listError } =
      await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (listError) {
      console.error("[forgot-username] listUsers error:", listError);
      return NextResponse.json(
        { data: null, error: "Internal error" },
        { status: 500 },
      );
    }

    const matchedUser = usersData.users.find((u) => u.email === normalizedEmail);

    if (matchedUser) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("full_name")
        .eq("id", matchedUser.id)
        .single();

      const fullName = profile?.full_name ?? null;
      // TODO: send email to normalizedEmail with fullName via email service (e.g. Resend)
      console.info(
        `[forgot-username] would send reminder to ${normalizedEmail}, name: ${fullName}`,
      );
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ data: { sent: true }, error: null });
  } catch (err) {
    console.error("[forgot-username] unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal error" },
      { status: 500 },
    );
  }
}
