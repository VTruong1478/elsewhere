import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const BUCKET = "user-photos";
/** Max object size to stream from storage (abuse / memory cap). */
const MAX_USER_PHOTO_BYTES = 6 * 1024 * 1024;

/**
 * Proxies user-photos bucket objects through the Next dev server so img src stays
 * same-origin (works when opening the app via the machine's LAN IP).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!Array.isArray(segments) || segments.length < 2) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const decoded = segments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  if (decoded.some((p) => p === ".." || p.includes("/"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const objectPath = decoded.join("/");
  if (!objectPath || objectPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(objectPath);

  if (error || !data) {
    console.error("[GET /api/storage/user-photos] download", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blob = data as Blob;
  if (blob.size > MAX_USER_PHOTO_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const contentType =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : "image/jpeg";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}
