'use client';

import { FeedMap, DEFAULT_MAP_ZOOM } from './FeedMap';
import type { FeedItem } from '@/types/feed';

interface MapPanelProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  showUserLocationDot?: boolean;
  userLocationForDot?: { lat: number; lng: number };
  /** See FeedMap `selectedMarkerScreenXRatio`. */
  selectedMarkerScreenXRatio?: number;
  /** See FeedMap `allowPinFitBounds`. */
  allowPinFitBounds?: boolean;
  /** See FeedMap `showRecenterButton`. Default true for this desktop panel. */
  showRecenterButton?: boolean;
}

/**
 * Map panel for the desktop feed / saved layout (remaining columns in `grid-cols-12`
 * after feed + optional place-detail column).
 * Hidden below `lg` so tablet matches mobile (feed-only); fills the right column on desktop.
 */
export function MapPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  center,
  showUserLocationDot,
  userLocationForDot,
  selectedMarkerScreenXRatio,
  allowPinFitBounds,
  showRecenterButton = true,
}: MapPanelProps) {
  return (
    <div className="relative hidden min-h-0 w-full lg:block lg:h-full">
      <div className="h-full w-full min-h-0 overflow-hidden">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={center}
          zoom={DEFAULT_MAP_ZOOM}
          showUserLocationDot={showUserLocationDot}
          userLocationForDot={userLocationForDot}
          selectedMarkerScreenXRatio={selectedMarkerScreenXRatio}
          allowPinFitBounds={allowPinFitBounds}
          showRecenterButton={showRecenterButton}
        />
      </div>
    </div>
  );
}
