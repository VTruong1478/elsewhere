import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/place-photos?placeId=...
 * Fetches up to 10 photos for a Google Place via Places API (New) Place Details.
 * placeId must be the Google place ID (e.g. ChIJ...), not our internal UUID.
 */
export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("placeId");
  if (!placeId || typeof placeId !== "string") {
    return NextResponse.json(
      { error: "placeId required" },
      { status: 400 },
    );
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Place photos not configured" },
      { status: 503 },
    );
  }

  const resourceName = placeId.startsWith("places/")
    ? placeId
    : `places/${placeId}`;
  const url = `https://places.googleapis.com/v1/${resourceName}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "photos",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[place-photos] Google API error:", res.status, text);
      return NextResponse.json(
        { error: "Place details unavailable" },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = (await res.json()) as {
      photos?: Array<{
        name?: string;
        authorAttributions?: Array<{
          displayName?: string;
          uri?: string;
        }>;
      }>;
    };

    const photos = data.photos ?? [];
    const list = photos.slice(0, 10).map((photo) => {
      const ref = photo.name ?? "";
      const encodedRef = encodeURIComponent(ref);
      return {
        ref,
        attribution: photo.authorAttributions?.length
          ? (photo.authorAttributions as Array<{
              displayName?: string;
              uri?: string;
            }>)
          : null,
        thumbUrl: `/api/place-photo?ref=${encodedRef}&maxWidthPx=400`,
      };
    });

    return NextResponse.json({ photos: list });
  } catch (e) {
    console.error("[place-photos]", e);
    return NextResponse.json(
      { error: "Place photos unavailable" },
      { status: 502 },
    );
  }
}
