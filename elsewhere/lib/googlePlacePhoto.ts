/** Max bytes we will buffer from Google Places photo media (abuse / memory cap). */
export const MAX_GOOGLE_PLACE_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Accepts Places API (New) photo resource names, with or without trailing `/media`.
 */
export function isValidGooglePlacesPhotoRef(ref: string): boolean {
  const trimmed = ref.trim().replace(/\/media$/, "");
  return /^places\/[^/]+\/photos\/[^/]+$/.test(trimmed);
}

export function normalizeGooglePlaceResourceName(googlePlaceId: string): string {
  const trimmed = googlePlaceId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("places/") ? trimmed : `places/${trimmed}`;
}

/**
 * Photo resource names from Place Details are short-lived. Re-fetch when a stored ref 404s.
 */
export async function fetchFreshGooglePhotoRef(
  googlePlaceId: string,
  apiKey: string,
): Promise<string | null> {
  const resourceName = normalizeGooglePlaceResourceName(googlePlaceId);
  if (!resourceName) return null;

  const res = await fetch(`https://places.googleapis.com/v1/${resourceName}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "photos",
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    photos?: Array<{ name?: string }>;
  };
  const raw = data.photos?.[0]?.name?.trim();
  if (!raw) return null;
  const ref = raw.replace(/\/media$/, "");
  return isValidGooglePlacesPhotoRef(ref) ? ref : null;
}

type GooglePlacePhotoMedia = {
  body: ArrayBuffer;
  contentType: string;
  resolvedRef: string;
};

export async function fetchGooglePlacePhotoMedia(
  ref: string,
  apiKey: string,
  maxWidthPx: number,
): Promise<GooglePlacePhotoMedia | null> {
  if (!isValidGooglePlacesPhotoRef(ref)) return null;

  const normalizedRef = ref.trim().replace(/\/media$/, "");
  const mediaName = `${normalizedRef}/media`;
  const url = `https://places.googleapis.com/v1/${mediaName}?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;

  const contentLength = res.headers.get("content-length");
  if (contentLength != null) {
    const n = parseInt(contentLength, 10);
    if (!Number.isNaN(n) && n > MAX_GOOGLE_PLACE_PHOTO_BYTES) {
      return null;
    }
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_GOOGLE_PLACE_PHOTO_BYTES) {
    return null;
  }

  return { body, contentType, resolvedRef: normalizedRef };
}
