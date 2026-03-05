'use client';

import { FeedMap } from './FeedMap';
import type { FeedItem } from '@/types/feed';

interface MapPanelProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
}

/**
 * Map panel for the desktop feed layout. Fills the right column, sticky,
 * no scrollbars. Height = viewport minus header so only the left feed scrolls.
 */
export function MapPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  center,
}: MapPanelProps) {
  return (
    <div className="relative hidden min-h-0 min-w-[320px] flex-1 md:block">
      <div className="h-full w-full overflow-hidden">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={center}
        />
      </div>
    </div>
  );
}
