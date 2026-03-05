import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MAX_WIDTH = 800;
const MIN_MAX_WIDTH = 100;
const MAX_MAX_WIDTH = 4800;

/**
 * Proxies Google Places (New) photo media so the API key stays server-side.
 * Query: ref or photoName = places/{placeId}/photos/{photo_reference}; optional maxWidthPx (default 800).
 */
export async function GET(request: NextRequest) {
  const ref =
    request.nextUrl.searchParams.get("ref") ??
    request.nextUrl.searchParams.get("photoName");
  if (!ref || typeof ref !== "string") {
    return NextResponse.json(
      { error: "ref or photoName required" },
      { status: 400 },
    );
  }

  let maxWidthPx = DEFAULT_MAX_WIDTH;
  const maxParam = request.nextUrl.searchParams.get("maxWidthPx");
  if (maxParam != null) {
    const n = parseInt(maxParam, 10);
    if (!Number.isNaN(n)) {
      maxWidthPx = Math.min(
        MAX_MAX_WIDTH,
        Math.max(MIN_MAX_WIDTH, n),
      );
    }
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Place photo not configured" },
      { status: 503 },
    );
  }

  const mediaName = ref.endsWith("/media")
    ? ref
    : `${ref.replace(/\/$/, "")}/media`;
  const url = `https://places.googleapis.com/v1/${mediaName}?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(key)}`;

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
