import { NextRequest, NextResponse } from "next/server";
import {
  isValidGooglePlacesPhotoRef,
  MAX_GOOGLE_PLACE_PHOTO_BYTES,
} from "@/lib/googlePlacePhoto";

const DEFAULT_MAX_WIDTH = 800;
const MIN_MAX_WIDTH = 100;
const MAX_MAX_WIDTH = 4800;

/**
 * Proxies Google Places (New) photo media so the API key stays server-side.
 * Query: ref or photoName; optional maxWidthPx (default 800).
 *
 * Ref must match Places API photo resource shape. Response size is capped.
 * Note: Anonymous feed imagery relies on this route; auth is not required here
 * so logged-out browsing keeps working. Abuse is limited by ref validation and
 * byte cap.
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

  if (!isValidGooglePlacesPhotoRef(ref)) {
    return NextResponse.json({ error: "Invalid photo reference" }, { status: 400 });
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

    const contentLength = res.headers.get("content-length");
    if (contentLength != null) {
      const n = parseInt(contentLength, 10);
      if (!Number.isNaN(n) && n > MAX_GOOGLE_PLACE_PHOTO_BYTES) {
        return NextResponse.json({ error: "Photo too large" }, { status: 413 });
      }
    }

    const contentType =
      res.headers.get("content-type") || "image/jpeg";
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_GOOGLE_PLACE_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo too large" }, { status: 413 });
    }

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
