'use client';

import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import type { FeedItem } from '@/types/feed';

const ATLANTA_CENTER = { lat: 33.749, lng: -84.388 };

interface FeedMapProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
}

function FeedMapInner({
  places,
  selectedPlaceId,
  onSelectPlace,
  center = ATLANTA_CENTER,
  zoom = 12,
}: FeedMapProps) {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID';

  return (
    <Map
      mapId={mapId}
      defaultCenter={center}
      defaultZoom={zoom}
      disableDefaultUI
      className="h-full w-full"
    >
      {places.map((place) => (
        <AdvancedMarker
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          title={place.name}
          onClick={() => onSelectPlace(place.id)}
        >
          <Pin
            scale={selectedPlaceId === place.id ? 1.15 : 1}
            background="#4F5D3F"
            borderColor="#4F5D3F"
            glyphColor="#FFFFFF"
          />
        </AdvancedMarker>
      ))}
    </Map>
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
