import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const authenticated =
    process.env.NODE_ENV === "development" &&
    cookieStore.get("dev_auth")?.value === "1";

  return NextResponse.json({ authenticated });
}
