'use client';

import { Heart } from 'lucide-react';
import type { FeedItem } from '@/types/feed';
import { usePlaceStore } from '@/store/usePlaceStore';
import { MetricTiles } from './MetricTiles';

function OpenStatus({
  open_now,
  closes_at,
  closing_soon,
  open_late,
}: {
  open_now: boolean;
  closes_at: string | null;
  closing_soon: boolean;
  open_late: boolean;
}) {
  if (open_late && open_now) {
    return <span className="text-ui-caption text-status-high">Open late</span>;
  }
  if (closing_soon && closes_at) {
    return (
      <span className="text-ui-caption text-status-medium">
        Closing soon ({closes_at})
      </span>
    );
  }
  if (open_now && closes_at) {
    return (
      <span className="text-ui-caption text-text-secondary">
        Open until {closes_at}
      </span>
    );
  }
  if (!open_now) {
    return <span className="text-ui-caption text-text-tertiary">Closed</span>;
  }
  return null;
}

export function PlaceCard({ place }: { place: FeedItem }) {
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();
  const isSelected = selectedPlaceId === place.id;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => setSelectedPlaceId(place.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelectedPlaceId(place.id);
        }
      }}
      className={`relative rounded-radius-sm border border-surface-alt bg-surface p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
        isSelected ? 'ring-2 ring-accent ring-offset-2' : ''
      }`}
      style={{
        backgroundColor: isSelected ? undefined : undefined,
      }}
    >
      {isSelected && (
        <div
          className="pointer-events-none absolute inset-0 rounded-radius-sm"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
          aria-hidden
        />
      )}
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-lora text-heading-s text-text mb-1">{place.name}</h2>
          <p className="text-body-s text-text-secondary mb-3">{place.address}</p>
          <MetricTiles
            noise={place.noise}
            tables={place.tables}
            outlets={place.outlets}
          />
          {place.pills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {place.pills.slice(0, 2).map((pill) => (
                <span
                  key={pill}
                  className="rounded-radius-sm bg-surface-chip px-2 py-0.5 text-ui-caption text-text"
                >
                  {pill}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {place.match_score_percent != null && (
              <span className="text-ui-label-m text-primary">
                {place.match_score_percent}% match
              </span>
            )}
            <OpenStatus
              open_now={place.open_now}
              closes_at={place.closes_at}
              closing_soon={place.closing_soon}
              open_late={place.open_late}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // TODO: favorite mutation
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-sm text-text-secondary hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label={place.is_favorited ? 'Unsave place' : 'Save place'}
        >
          <Heart
            size={20}
            fill={place.is_favorited ? 'currentColor' : 'none'}
            stroke="currentColor"
          />
        </button>
      </div>
    </article>
  );
}
