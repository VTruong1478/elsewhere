'use client';

import { useEffect, useState, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { Locate } from 'lucide-react';
import type { FeedItem } from '@/types/feed';
import { usePlaceStore } from '@/store/usePlaceStore';

const ATLANTA_CENTER = { lat: 33.749, lng: -84.388 };

/** Same tier colors as MatchRing (tailwind theme: status-high, status-medium, status-low) */
const TIER_COLORS = {
  high: '#4F5D3F',
  medium: '#C4943A',
  low: '#A85C3A',
} as const;

function getTierColor(score: number): string {
  if (score >= 80) return TIER_COLORS.high;
  if (score >= 60) return TIER_COLORS.medium;
  return TIER_COLORS.low;
}

interface FeedMapProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
}

const PADDING_PX = 48;
const MAX_ZOOM = 15;
const MIN_ZOOM = 10;

function MapFitBounds({ places }: { places: FeedItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || places.length === 0) return;
    const valid = places.filter(
      (p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !Number.isNaN(p.lat) && !Number.isNaN(p.lng)
    );
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(MAX_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    valid.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, { top: PADDING_PX, right: PADDING_PX, bottom: PADDING_PX, left: PADDING_PX });
    const listener = google.maps.event.addListener(map, 'idle', () => {
      const z = map.getZoom();
      if (z != null && z > MAX_ZOOM) map.setZoom(MAX_ZOOM);
      if (z != null && z < MIN_ZOOM) map.setZoom(MIN_ZOOM);
      google.maps.event.removeListener(listener);
    });
    return () => google.maps.event.removeListener(listener);
  }, [map, places]);

  return null;
}

function MapMarkerContent({
  score,
  selected,
  hovered,
  onMouseEnter,
  onMouseLeave,
}: {
  score: number;
  selected: boolean;
  hovered: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const color = getTierColor(score);
  const scale = selected ? 1.2 : hovered ? 1.1 : 1;
  const ring = selected ? '0 0 0 3px rgba(255,255,255,0.9)' : 'none';

  return (
    <div
      className="relative flex origin-bottom cursor-pointer items-center justify-center transition-transform duration-150 ease-out"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="img"
      aria-label={`${Math.round(score)}% match`}
      style={{
        transform: `scale(${scale})`,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-inverse"
        style={{
          backgroundColor: color,
          boxShadow: ring,
          border: '2px solid rgba(255,255,255,0.9)',
        }}
      >
        <span className="text-ui-label-s font-bold tabular-nums">
          {Math.round(Math.min(100, Math.max(0, score)))}%
        </span>
      </div>
      {/* Small pointer at bottom to match pin style */}
      <div
        className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-white/90"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

/** User location dot (blue "you are here" style) */
function UserLocationMarker() {
  return (
    <div
      className="flex items-center justify-center"
      role="img"
      aria-label="Your location"
    >
      {/* Outer pulse ring */}
      <div
        className="absolute h-6 w-6 rounded-full border-2 border-accent opacity-40"
        style={{ backgroundColor: 'transparent' }}
      />
      {/* Inner solid dot */}
      <div
        className="h-3 w-3 rounded-full border-2 border-white shadow-map"
        style={{ backgroundColor: '#3E4F73' }}
      />
    </div>
  );
}

const USER_LOCATION_ZOOM = 14;

function MapLocateControl() {
  const map = useMap();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setUserLocation(location);
        if (map) {
          map.setCenter(location);
          map.setZoom(USER_LOCATION_ZOOM);
        }
        setIsLocating(false);
      },
      (err) => {
        setError(err.message || 'Could not get location');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [map]);

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation} title="Your location" zIndex={1}>
          <UserLocationMarker />
        </AdvancedMarker>
      )}
      <div className="absolute bottom-3 right-3 z-30">
        <button
          type="button"
          onClick={handleLocate}
          disabled={isLocating}
          className="flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface shadow-map text-text hover:bg-surface-alt disabled:opacity-60"
          aria-label={isLocating ? 'Getting your location…' : 'Center map on your location'}
          title={isLocating ? 'Getting your location…' : 'Center map on your location'}
        >
          <Locate className="h-5 w-5 text-accent" aria-hidden />
        </button>
        {error && (
          <span className="sr-only" role="alert">
            {error}
          </span>
        )}
      </div>
    </>
  );
}

function FeedMapInner({
  places,
  selectedPlaceId,
  onSelectPlace,
  center = ATLANTA_CENTER,
  zoom = 12,
}: FeedMapProps) {
  const { hoveredPlaceId, setHoveredPlaceId } = usePlaceStore();
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID';

  const validPlaces = places.filter(
    (p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !Number.isNaN(p.lat) && !Number.isNaN(p.lng)
  );

  return (
    <div className="h-full w-full">
      <Map
        mapId={mapId}
        defaultCenter={center}
        defaultZoom={zoom}
        disableDefaultUI
        className="h-full w-full"
      >
        <MapFitBounds places={validPlaces} />
        <MapLocateControl />
        {validPlaces.map((place) => {
          const score = place.match_score_percent ?? 0;
          const selected = selectedPlaceId === place.id;
          const hovered = hoveredPlaceId === place.id;
          return (
            <AdvancedMarker
              key={place.id}
              position={{ lat: place.lat, lng: place.lng }}
              title={place.name}
              onClick={() => onSelectPlace(place.id)}
            >
              <MapMarkerContent
                score={score}
                selected={selected}
                hovered={hovered}
                onMouseEnter={() => setHoveredPlaceId(place.id)}
                onMouseLeave={() => setHoveredPlaceId(null)}
              />
            </AdvancedMarker>
          );
        })}
      </Map>
    </div>
  );
}

export function FeedMap(props: FeedMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-alt px-4 text-center text-text-secondary">
        <p className="text-body-m font-medium">Map unavailable: missing API key</p>
        <p className="text-body-s">
          Add <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to{' '}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">.env.local</code>. Get a key from{' '}
          <a
            href="https://console.cloud.google.com/google/maps-apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Google Cloud Console
          </a>{' '}
          (enable Maps JavaScript API), then restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[200px]">
      <APIProvider apiKey={apiKey}>
        <FeedMapInner {...props} />
      </APIProvider>
    </div>
  );
}
