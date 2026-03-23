/** Annandale, VA — fallback center for feed + map when location is off or user is outside the service area. */
export const ANNANDALE_FALLBACK = { lat: 38.8304, lng: -77.1941 } as const;

/** "Near Northern Virginia" = within this distance of Annandale (product rule). */
export const NOVA_NEAR_RADIUS_MILES = 50;

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_MILE = 1609.344;

export function distanceMetersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanceMilesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return distanceMetersBetween(a, b) / METERS_PER_MILE;
}

export function isNearNorthernVirginia(lat: number, lng: number): boolean {
  return (
    distanceMilesBetween(ANNANDALE_FALLBACK, { lat, lng }) <= NOVA_NEAR_RADIUS_MILES
  );
}
