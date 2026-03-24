'use client';

import { FeedMap } from './FeedMap';
import type { FeedItem } from '@/types/feed';

interface MapPanelProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  showUserLocationDot?: boolean;
  userLocationForDot?: { lat: number; lng: number };
}

/**
 * Map panel for the desktop feed / saved layout (8fr column in `grid-cols-[5fr_8fr]`).
 * Hidden below `lg` so tablet matches mobile (feed-only); fills the right column on desktop.
 */
export function MapPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  center,
  showUserLocationDot,
  userLocationForDot,
}: MapPanelProps) {
  return (
    <div className="relative hidden min-h-0 w-full lg:block lg:h-full">
      <div className="h-full w-full min-h-0 overflow-hidden">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={center}
          showUserLocationDot={showUserLocationDot}
          userLocationForDot={userLocationForDot}
        />
      </div>
    </div>
  );
}
