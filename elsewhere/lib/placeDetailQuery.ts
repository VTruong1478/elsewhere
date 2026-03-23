import type { PlaceDetailResponse } from '@/types/placeDetail';

export const placeDetailQueryKey = (normalizedPlaceId: string) =>
  ['placeDetail', normalizedPlaceId] as const;

/**
 * Fetches GET /api/places/[id]. Used by React Query for caching + prefetch on marker hover.
 */
export async function fetchPlaceDetail(
  normalizedId: string,
): Promise<PlaceDetailResponse> {
  const res = await fetch(`/api/places/${normalizedId}`);
  const body = (await res.json()) as {
    data?: PlaceDetailResponse | null;
    error?: unknown;
  };
  if (!res.ok) {
    const msg =
      typeof body.error === 'string'
        ? body.error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const payload = body.data;
  const resolvedPlaceId =
    payload?.place?.id != null ? String(payload.place.id).trim() : '';
  if (!resolvedPlaceId) {
    throw new Error('Invalid response from server');
  }
  return payload;
}
