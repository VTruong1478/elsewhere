'use client';

import dynamic from 'next/dynamic';
import type { FeedItem } from '@/types/feed';

const MapboxMap = dynamic(() => import('./MapboxMap').then((m) => m.MapboxMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface-alt">
      <div className="text-body-m text-text-secondary">Loading map…</div>
    </div>
  ),
});

export interface FeedMapProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
}

export function FeedMap(props: FeedMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!token?.trim()) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-alt px-4 text-center text-text-secondary">
        <p className="text-body-m font-medium">Map unavailable: missing Mapbox token</p>
        <p className="text-body-s">
          Add{' '}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
          </code>{' '}
          to{' '}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            .env.local
          </code>
          . Optionally set{' '}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            NEXT_PUBLIC_MAPBOX_STYLE_URL
          </code>{' '}
          for a custom style. Restart the dev server after changing env.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[200px]">
      <MapboxMap {...props} />
    </div>
  );
}
