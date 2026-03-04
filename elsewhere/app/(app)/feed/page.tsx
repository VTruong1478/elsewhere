'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { SearchBar } from '@/components/feed/SearchBar';
import { FilterChips } from '@/components/feed/FilterChips';
import { PlaceCard } from '@/components/feed/PlaceCard';
import { PlaceCardSkeleton } from '@/components/feed/PlaceCardSkeleton';
import { FeedEmptyState } from '@/components/feed/EmptyState';
import { FeedMap } from '@/components/map/FeedMap';
import { usePlaceStore } from '@/store/usePlaceStore';
import type { FeedItem } from '@/types/feed';

const ATLANTA_CENTER = { lat: 33.749, lng: -84.388 };

function useUserLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(ATLANTA_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(ATLANTA_CENTER)
    );
  }, []);
  return coords;
}

function fetchFeed(params: {
  lat: number;
  lng: number;
  q: string;
  filter: string;
}): Promise<FeedItem[]> {
  const sp = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.q) sp.set('q', params.q);
  if (params.filter) sp.set('filter', params.filter);
  return fetch(`/api/feed?${sp.toString()}`).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  });
}

function FeedContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const filter = searchParams.get('filter') ?? '';
  const location = useUserLocation();
  const { selectedPlaceId, setSelectedPlaceId } = usePlaceStore();

  const query = useQuery({
    queryKey: ['feed', location?.lat, location?.lng, q, filter],
    queryFn: () =>
      fetchFeed({
        lat: location!.lat,
        lng: location!.lng,
        q,
        filter,
      }),
    enabled: location != null,
  });

  const places: FeedItem[] = query.data ?? [];
  const onSelectPlace = useCallback((id: string) => setSelectedPlaceId(id), [setSelectedPlaceId]);

  return (
    <>
      <div className="flex min-h-0 w-full flex-col overflow-hidden md:max-w-md md:flex-shrink-0 md:overflow-y-auto">
        <div className="shrink-0 space-y-4 p-4 md:p-6">
          <SearchBar />
          <FilterChips />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-6">
          {(location == null || query.isLoading) && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          )}
          {location != null && query.isError && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="font-lora text-heading-m text-text mb-2">Couldn’t load the feed</p>
              <p className="text-body-m text-text-secondary mb-4">{query.error?.message ?? 'Something went wrong.'}</p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="rounded-radius-sm bg-accent px-4 py-2 text-ui-button text-text-inverse"
              >
                Try again
              </button>
            </div>
          )}
          {location != null && query.isSuccess && places.length === 0 && <FeedEmptyState />}
          {location != null && query.isSuccess && places.length > 0 && (
            <div className="space-y-4">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="h-[280px] min-h-0 flex-1 shrink-0 md:h-full md:min-h-[400px]">
        <FeedMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          center={location ?? undefined}
        />
      </div>
    </>
  );
}

function FeedPageFallback() {
  return (
    <>
      <div className="flex min-h-0 w-full flex-col overflow-hidden md:max-w-md md:flex-shrink-0 md:overflow-y-auto">
        <div className="shrink-0 space-y-4 p-4 md:p-6">
          <div className="h-12 rounded-radius-sm bg-surface-alt animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-20 rounded-radius-sm bg-surface-alt animate-pulse" />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 md:px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="hidden h-full min-h-0 flex-1 md:block bg-surface-alt" />
    </>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageFallback />}>
      <FeedContent />
    </Suspense>
  );
}
