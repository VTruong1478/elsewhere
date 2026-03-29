/** Max bytes we will buffer from Google Places photo media (abuse / memory cap). */
export const MAX_GOOGLE_PLACE_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Accepts Places API (New) photo resource names, with or without trailing `/media`.
 */
export function isValidGooglePlacesPhotoRef(ref: string): boolean {
  const trimmed = ref.trim().replace(/\/media$/, "");
  return /^places\/[^/]+\/photos\/[^/]+$/.test(trimmed);
}
