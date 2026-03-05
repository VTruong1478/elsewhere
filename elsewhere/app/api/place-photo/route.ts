import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies Google Places (New) photo media so the API key stays server-side.
 * Query: photoName = places/{placeId}/photos/{photo_reference} (append /media in code if needed).
 */
export async function GET(request: NextRequest) {
  const photoName = request.nextUrl.searchParams.get("photoName");
  if (!photoName || typeof photoName !== "string") {
    return NextResponse.json({ error: "photoName required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Place photo not configured" },
      { status: 503 },
    );
  }

  const mediaName = photoName.endsWith("/media")
    ? photoName
    : `${photoName.replace(/\/$/, "")}/media`;
  const url = `https://places.googleapis.com/v1/${mediaName}?maxWidthPx=800&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Photo unavailable" },
        { status: res.status === 404 ? 404 : 502 },
      );
    }
    const contentType =
      res.headers.get("content-type") || "image/jpeg";
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Photo unavailable" },
      { status: 502 },
    );
  }
}
