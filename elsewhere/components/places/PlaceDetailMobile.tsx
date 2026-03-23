'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import type { FeedItem } from '@/types/feed';
import type { PlaceDetailResponse } from '@/types/placeDetail';
import { FeedMap } from '@/components/map/FeedMap';
import { StatusDot } from '@/components/ui/StatusDot';
import { MetricTile } from '@/components/ui/MetricTile';
import { PlaceDetailCta } from '@/components/places/PlaceDetailCta';
import { deriveOpeningState, hasOpenLate } from '@/lib/opening-hours';
import { createClient } from '@/lib/supabase/client';
import { normalizePlaceId } from '@/lib/placeId';
import {
  fetchPlaceDetail,
  placeDetailQueryKey,
} from '@/lib/placeDetailQuery';
import { usePlaceStore } from '@/store/usePlaceStore';

type OpeningHoursType = Parameters<typeof deriveOpeningState>[0];

type PlaceDetailMobileProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
  renderMap?: boolean;
  initialSnap?: 'full' | 'mid' | 'peek';
  onDismiss?: () => void;
  /** Feed row for this place (map tab): instant header/metrics while detail API loads + cache warms. */
  previewFeedItem?: FeedItem | null;
};

function n(v: number | string | bigint | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') return Number(v);
  return v;
}

function dominantNoiseFromCounts(stats: PlaceDetailResponse['place_stats']): 'Silent' | 'Quiet' | 'Vibrant' | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const silent = n(stats.noise_silent);
  const quiet = n(stats.noise_quiet);
  const vibrant = n(stats.noise_vibrant);
  const max = Math.max(silent, quiet, vibrant);
  if (max === 0) return null;
  const matches = [silent === max, quiet === max, vibrant === max].filter(Boolean).length;
  if (matches > 1) return 'Quiet';
  if (quiet === max) return 'Quiet';
  if (vibrant === max) return 'Vibrant';
  return 'Silent';
}

function dominantVibeFromCounts(stats: PlaceDetailResponse['place_stats']): 'Focused' | 'Casual' | 'Social' | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const focused = n(stats.vibe_focused);
  const casual = n(stats.vibe_casual);
  const social = n(stats.vibe_social);
  const max = Math.max(focused, casual, social);
  if (max === 0) return null;
  const matches = [focused === max, casual === max, social === max].filter(Boolean).length;
  if (matches > 1) return 'Casual';
  if (casual === max) return 'Casual';
  if (focused === max) return 'Focused';
  return 'Social';
}

function dominantTablesFromCounts(stats: PlaceDetailResponse['place_stats']): 'limited' | 'mixed' | 'plentiful' | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const limited = n(stats.tables_limited);
  const mixed = n(stats.tables_mixed);
  const plentiful = n(stats.tables_plentiful);
  const max = Math.max(limited, mixed, plentiful);
  if (max === 0) return null;
  const matches = [limited === max, mixed === max, plentiful === max].filter(Boolean).length;
  if (matches > 1) return 'mixed';
  if (mixed === max) return 'mixed';
  if (limited === max) return 'limited';
  return 'plentiful';
}

function dominantOutletsFromCounts(stats: PlaceDetailResponse['place_stats']): 'scarce' | 'some' | 'ample' | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const scarce = n(stats.outlets_scarce);
  const some = n(stats.outlets_some);
  const ample = n(stats.outlets_ample);
  const max = Math.max(scarce, some, ample);
  if (max === 0) return null;
  const matches = [scarce === max, some === max, ample === max].filter(Boolean).length;
  if (matches > 1) return 'some';
  if (some === max) return 'some';
  if (scarce === max) return 'scarce';
  return 'ample';
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/** Single place on the map: markers only render from `places`; match % from avg rating when available */
function feedItemForDetailMap(
  placeId: string,
  coords: { lat: number; lng: number },
  row: PlaceDetailResponse['place'] | null,
  avgOverall: number | null,
): FeedItem {
  const match =
    avgOverall != null && !Number.isNaN(avgOverall)
      ? Math.round(Math.min(5, Math.max(0, avgOverall)) * 20)
      : null;
  return {
    id: placeId,
    name: row?.name ?? '—',
    address: row?.address ?? '',
    lat: coords.lat,
    lng: coords.lng,
    place_type: row?.place_type ?? '',
    noise: null,
    tables: null,
    outlets: null,
    match_score_percent: match,
    why_matched: [],
    open_now: false,
    closes_at: null,
    closing_soon: false,
    open_late: false,
    pills: [],
  };
}

function previewPlaceFromFeed(
  feed: FeedItem,
  canonicalId: string,
): PlaceDetailResponse['place'] {
  return {
    id: canonicalId,
    name: feed.name,
    address: feed.address,
    lat: feed.lat,
    lng: feed.lng,
    place_type: feed.place_type,
    opening_hours: null,
    timezone: null,
    google_photo_ref: feed.google_photo_ref ?? null,
    vibe_photo_path: feed.vibe_photo_path ?? null,
    vibe_photo_ref: feed.vibe_photo_ref ?? null,
    vibe_photo_attribution: feed.vibe_photo_attribution ?? null,
  };
}

export function PlaceDetailMobile({
  placeId,
  initialCenter,
  renderMap = true,
  initialSnap = 'mid',
  onDismiss,
  previewFeedItem = null,
}: PlaceDetailMobileProps) {
  const NOVA_CENTER = { lat: 38.8304, lng: -77.1941 };
  const DEFAULT_MAP_ZOOM = 11;
  const DETAIL_MAP_ZOOM = 15;
  const { setSelectedPlaceId, setHoveredPlaceId } = usePlaceStore();

  // Only clear global selection when leaving the full-screen place detail flow
  // (`/places/[id]` with embedded map). When this component is used as a bottom sheet
  // overlay on the map tab (`renderMap={false}`), unmount cleanup must NOT run — React
  // Strict Mode remounts would immediately clear the marker tap selection.
  useEffect(() => {
    if (!renderMap) return;
    return () => {
      setSelectedPlaceId(null);
      setHoveredPlaceId(null);
    };
  }, [renderMap, setSelectedPlaceId, setHoveredPlaceId]);
  const supabase = useMemo(() => createClient(), []);

  const normalizedId = useMemo(() => normalizePlaceId(placeId), [placeId]);
  const previewMatches = useMemo(
    () =>
      Boolean(
        previewFeedItem &&
          normalizedId &&
          normalizePlaceId(previewFeedItem.id) === normalizedId,
      ),
    [previewFeedItem, normalizedId],
  );

  const {
    data: detail,
    isLoading,
    isFetching,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: placeDetailQueryKey(normalizedId ?? '__invalid__'),
    queryFn: () => fetchPlaceDetail(normalizedId!),
    enabled: !!normalizedId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const loadError = !normalizedId
    ? 'Place not found'
    : isError
      ? queryError instanceof Error
        ? queryError.message
        : 'Could not load place'
      : null;

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isDefaultMapView, setIsDefaultMapView] = useState(false);

  useEffect(() => {
    if (!renderMap) return;
    setIsDefaultMapView(false);
  }, [placeId, renderMap]);

  useEffect(() => {
    if (!renderMap) return;
    setSelectedPlaceId(isDefaultMapView ? null : placeId);
  }, [isDefaultMapView, placeId, setSelectedPlaceId, renderMap]);

  // Build photo URLs (from storage paths where available, otherwise omit).
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const vibePath =
        detail?.place.vibe_photo_path?.trim() ??
        (previewMatches ? previewFeedItem?.vibe_photo_path?.trim() : undefined);

      if (!vibePath) {
        if (!cancelled) setPhotoUrls([]);
        return;
      }

      const next: string[] = [];
      const objectPath = vibePath.startsWith('user-photos/')
        ? vibePath.slice('user-photos/'.length)
        : vibePath;
      const { data } = supabase.storage.from('user-photos').getPublicUrl(objectPath);
      if (data?.publicUrl) next.push(data.publicUrl);

      if (!cancelled) setPhotoUrls(next);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [detail, previewMatches, previewFeedItem, supabase]);

  // Snap points (mobile/tablet only page, so we can rely on window dimensions after mount)
  const [heights, setHeights] = useState<{ full: number; mid: number; peek: number; midTy: number; peekTy: number; maxTy: number } | null>(null);
  const DISMISS_DRAG_BUFFER_PX = 80;
  const DISMISS_THRESHOLD_PX = 40;
  useEffect(() => {
    function recalc() {
      const h = window.innerHeight;
      // Peek: name/status + handle
      const peek = Math.round(h * 0.28);
      // Mid: about half screen
      const mid = Math.round(h * 0.58);
      // Full: majority of screen
      const full = Math.round(h * 0.82);

      const midTy = full - mid;
      const peekTy = full - peek;
      setHeights({
        full,
        mid,
        peek,
        midTy,
        peekTy,
        maxTy: peekTy + DISMISS_DRAG_BUFFER_PX,
      });
    }

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  const [translateY, setTranslateY] = useState(0);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartTyRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!heights) return;
    const ty =
      initialSnap === 'full'
        ? 0
        : initialSnap === 'peek'
          ? heights.peekTy
          : heights.midTy;
    setTranslateY(ty);
  }, [heights, placeId, initialSnap]);

  function clampTy(ty: number): number {
    if (!heights) return ty;
    return Math.max(0, Math.min(heights.maxTy, ty));
  }

  function pickSnap(ty: number): 0 | 1 | 2 {
    if (!heights) return 0;
    const targets: Array<{ idx: 0 | 1 | 2; ty: number }> = [
      { idx: 0, ty: 0 },
      { idx: 1, ty: heights.midTy },
      { idx: 2, ty: heights.peekTy },
    ];
    let best = targets[0];
    for (const t of targets) {
      if (Math.abs(t.ty - ty) < Math.abs(best.ty - ty)) best = t;
    }
    return best.idx;
  }

  function snapTo(idx: 0 | 1 | 2) {
    if (!heights) return;
    const ty = idx === 0 ? 0 : idx === 1 ? heights.midTy : heights.peekTy;
    setTranslateY(ty);
  }

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!heights) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointerIdRef.current = e.pointerId;
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartTyRef.current = translateY;

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current || !heights) return;
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
    const dy = e.clientY - dragStartYRef.current;
    const next = clampTy(dragStartTyRef.current + dy);
    setTranslateY(next);
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!heights) return;
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;

    isDraggingRef.current = false;
    pointerIdRef.current = null;
    if (onDismiss && translateY > heights.peekTy + DISMISS_THRESHOLD_PX) {
      onDismiss();
      return;
    }
    const idx = pickSnap(translateY);
    snapTo(idx);
  }

  const stats = detail?.place_stats ?? null;
  const place =
    detail?.place ??
    (previewMatches && previewFeedItem && normalizedId
      ? previewPlaceFromFeed(previewFeedItem, normalizedId)
      : undefined);

  const ratingCount = stats
    ? n(stats.rating_count)
    : previewMatches && previewFeedItem
      ? (previewFeedItem.rating_count ?? 0)
      : 0;

  const opening = useMemo(() => {
    if (!place) return null;
    const openingHours = place.opening_hours as OpeningHoursType | null;
    if (!openingHours) return null;
    return deriveOpeningState(openingHours, place.timezone);
  }, [place]);

  const openLate = useMemo(() => {
    if (!place) return false;
    const openingHours = place.opening_hours as OpeningHoursType | null;
    return hasOpenLate(openingHours, place.timezone);
  }, [place]);

  const status = useMemo(() => {
    if (opening) {
      const closes = opening.closes_at ?? '';
      if (!opening.open_now) {
        return {
          status: 'closed' as const,
          label: 'Closed',
          subLabel: ratingCount > 0 ? `· ${ratingCount} ratings` : undefined,
        };
      }
      if (opening.closing_soon && closes) {
        return {
          status: 'closing-soon' as const,
          label: `Closing soon (${closes})`,
          subLabel: `· ${ratingCount} ratings`,
        };
      }
      if (opening.open_now && closes) {
        return {
          status: 'open' as const,
          label: `Open until ${closes}`,
          subLabel: `· ${ratingCount} ratings`,
        };
      }
      if (openLate) {
        return {
          status: 'open' as const,
          label: 'Open late',
          subLabel: `· ${ratingCount} ratings`,
        };
      }
      return {
        status: 'open' as const,
        label: 'Open',
        subLabel: `· ${ratingCount} ratings`,
      };
    }
    if (previewMatches && previewFeedItem) {
      const sub = ratingCount > 0 ? `· ${ratingCount} ratings` : undefined;
      if (!previewFeedItem.open_now) {
        return { status: 'closed' as const, label: 'Closed', subLabel: sub };
      }
      if (previewFeedItem.closing_soon && previewFeedItem.closes_at) {
        return {
          status: 'closing-soon' as const,
          label: `Closing soon (${previewFeedItem.closes_at})`,
          subLabel: sub,
        };
      }
      if (previewFeedItem.open_now && previewFeedItem.closes_at) {
        return {
          status: 'open' as const,
          label: `Open until ${previewFeedItem.closes_at}`,
          subLabel: sub,
        };
      }
      if (previewFeedItem.open_late) {
        return { status: 'open' as const, label: 'Open late', subLabel: sub };
      }
      return { status: 'open' as const, label: 'Open', subLabel: sub };
    }
    return {
      status: 'closed' as const,
      label: '—',
      subLabel: undefined as string | undefined,
    };
  }, [opening, ratingCount, openLate, previewMatches, previewFeedItem]);

  const dominantNoise = stats
    ? dominantNoiseFromCounts(stats)
    : previewMatches && previewFeedItem
      ? (previewFeedItem.dominant_noise ?? previewFeedItem.noise ?? null)
      : null;
  const dominantVibe = stats
    ? dominantVibeFromCounts(stats)
    : previewMatches && previewFeedItem
      ? (previewFeedItem.dominant_vibe ?? previewFeedItem.vibe ?? null)
      : null;
  const dominantTables = stats
    ? dominantTablesFromCounts(stats)
    : previewMatches && previewFeedItem
      ? (previewFeedItem.dominant_tables ?? previewFeedItem.tables ?? null)
      : null;
  const dominantOutlets = stats
    ? dominantOutletsFromCounts(stats)
    : previewMatches && previewFeedItem
      ? (previewFeedItem.dominant_outlets ?? previewFeedItem.outlets ?? null)
      : null;

  const coords =
    place && isFinite(Number(place.lat)) && isFinite(Number(place.lng))
      ? { lat: Number(place.lat), lng: Number(place.lng) }
      : initialCenter;
  const avgOverall =
    stats?.avg_overall_rating != null
      ? typeof stats.avg_overall_rating === 'number'
        ? stats.avg_overall_rating
        : Number(stats.avg_overall_rating)
      : previewMatches &&
          previewFeedItem?.match_score_percent != null &&
          !Number.isNaN(previewFeedItem.match_score_percent)
        ? previewFeedItem.match_score_percent / 20
        : null;
  const mapPlaces = useMemo(
    () =>
      previewMatches && previewFeedItem && !detail
        ? [previewFeedItem]
        : [feedItemForDetailMap(placeId, coords, place ?? null, avgOverall)],
    [
      previewMatches,
      previewFeedItem,
      detail,
      placeId,
      coords,
      place,
      avgOverall,
    ],
  );

  const mapCenterOffsetPx = heights ? Math.round(heights.mid) : 100;
  const mapPlacesToRender = isDefaultMapView ? [] : mapPlaces;
  const mapCenter = isDefaultMapView ? NOVA_CENTER : coords;
  const mapZoom = isDefaultMapView ? DEFAULT_MAP_ZOOM : DETAIL_MAP_ZOOM;
  const mapSelectedPlaceId = isDefaultMapView ? null : placeId;
  const mapInstanceKey = `${isDefaultMapView ? 'default' : 'detail'}-${placeId}`;

  function handleResetToDefaultMapView() {
    setIsDefaultMapView(true);
    setSelectedPlaceId(null);
  }

  if (isLoading && !previewMatches) {
    // No cache + no feed preview: skeleton while the first fetch runs.
    return (
      <div className={renderMap ? 'fixed inset-0' : 'absolute inset-0 pointer-events-none'}>
        {renderMap && (
          <div className="absolute inset-0 pointer-events-auto">
            <FeedMap
              key={mapInstanceKey}
              places={[feedItemForDetailMap(placeId, initialCenter, null, null)]}
              selectedPlaceId={mapSelectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              center={mapCenter}
              zoom={mapZoom}
              centerVerticalOffsetPx={mapCenterOffsetPx}
            />
          </div>
        )}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 overflow-hidden rounded-t-radius-md bg-surface shadow-map">
          <div className="flex w-full shrink-0 justify-center pt-12 pb-8">
            <div
              className="h-4 w-40 rounded-radius-md bg-surface-alt animate-pulse"
              aria-hidden
            />
          </div>
          <div className="px-16 pb-24">
            <div className="h-32 max-w-[280px] rounded-radius-sm bg-surface-alt animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={renderMap ? 'fixed inset-0 overflow-hidden' : 'absolute inset-0 overflow-hidden pointer-events-none'}>
      {renderMap && (
        <div className="absolute inset-0 pointer-events-auto">
          <FeedMap
            key={mapInstanceKey}
            places={mapPlacesToRender}
            selectedPlaceId={mapSelectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
            center={mapCenter}
            zoom={mapZoom}
            centerVerticalOffsetPx={mapCenterOffsetPx}
          />
        </div>
      )}
      {renderMap && (
        <div className="pointer-events-auto absolute left-3 top-3 z-30">
          <button
            type="button"
            onClick={handleResetToDefaultMapView}
            className="flex h-10 w-10 items-center justify-center rounded-radius-sm border border-surface-alt bg-surface text-text shadow-map hover:bg-surface-alt"
            aria-label="Reset to default map view"
            title="Reset to default map view"
          >
            <Compass className="h-5 w-5 text-accent" aria-hidden />
          </button>
        </div>
      )}

      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close place details"
        onClick={() => onDismiss?.()}
        className={`absolute inset-0 bg-black/0 ${onDismiss ? 'pointer-events-auto' : 'pointer-events-none'}`}
      />

      {/* Bottom sheet */}
      {!isDefaultMapView && (
        <div
          className={[
            renderMap ? 'fixed' : 'absolute',
            'pointer-events-auto bottom-0 left-0 right-0 z-30 overflow-hidden rounded-t-radius-md bg-surface shadow-map',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            height: heights?.full ?? 'auto',
            transform: `translateY(${translateY}px)`,
            transition: isDraggingRef.current ? 'none' : 'transform 260ms ease-out',
          }}
        >
        <div className="flex h-full flex-col">
          {/* Drag handle */}
          <div
            className="flex w-full shrink-0 justify-center pt-12 pb-8"
            aria-hidden={false}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label="Drag to expand place details"
              className="h-4 w-40 rounded-radius-md bg-surface-alt"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              style={{ touchAction: 'none' }}
            />
          </div>

          {/* Header + scroll (padding bottom reserves space for viewport-fixed CTAs) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-16">
            <header className="shrink-0">
              <h2 className="font-lora text-heading-l text-text">
                {place?.name ?? (loadError ? 'Unable to load' : '—')}
              </h2>
              {isFetching && previewMatches ? (
                <p className="mt-4 text-body-s text-text-tertiary" aria-live="polite">
                  Updating…
                </p>
              ) : null}
              <div className="mt-4">
                {place && status ? (
                  <StatusDot status={status.status} label={status.label} subLabel={status.subLabel} />
                ) : null}
              </div>
            </header>

            <div
              className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scrollbar-hide [-webkit-overflow-scrolling:touch] pb-[240px]"
            >
              {loadError && !place ? (
                <p className="text-body-m text-text-secondary pr-4">{loadError}</p>
              ) : null}
              {loadError && place ? (
                <p className="text-body-s text-text-tertiary pr-4 pb-8">{loadError}</p>
              ) : null}
              {place ? (
                <>
                  {photoUrls.length > 0 && (
                    <div className="pb-12">
                      <div className="flex gap-8 overflow-x-auto scrollbar-hide pb-8">
                        {photoUrls.map((src, idx) => (
                          <img
                            key={`${src}-${idx}`}
                            src={src}
                            alt=""
                            className="h-[96px] w-[128px] shrink-0 rounded-radius-md object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 pb-12">
                    <MetricTile type="noise" value={dominantNoise} />
                    <MetricTile type="vibes" value={dominantVibe} />
                    <MetricTile type="tables" value={dominantTables} />
                    <MetricTile type="outlets" value={dominantOutlets} />
                  </div>

                  <div className="pb-8">
                    <div className="text-body-m text-text font-bold">Notes &amp; Tips</div>
                    {detail?.notes?.length ? (
                      <div className="mt-8 space-y-12 pr-4">
                        {detail.notes.map((note) => (
                          <div key={note.id} className="flex gap-8">
                            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-radius-md border border-surface-alt bg-surface-alt">
                              <span className="text-ui-label-s font-bold text-text-secondary">
                                {note.user_initial}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-8">
                                <span className="text-body-s text-text-tertiary">
                                  {timeAgo(note.created_at)}
                                </span>
                              </div>
                              <div className="mt-4 text-body-m text-text">
                                &ldquo;{note.notes}&rdquo;
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-8 text-body-s text-text-tertiary">No notes yet.</div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        </div>
      )}

      {!isDefaultMapView && (
        <PlaceDetailCta
          className={!renderMap ? 'pointer-events-auto' : ''}
          rateHref={`/places/${placeId}/rate?name=${encodeURIComponent(place?.name ?? '')}`}
          onShare={async () => {
            const url = `${window.location.origin}/places/${placeId}`;
            if (navigator.share) {
              try {
                await navigator.share({ url, title: place?.name ?? '' });
              } catch {
                // ignore
              }
            } else {
              await navigator.clipboard.writeText(url);
            }
          }}
          onDirections={() => {
            const lat = place?.lat ?? initialCenter.lat;
            const lng = place?.lng ?? initialCenter.lng;
            const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
        />
      )}
    </div>
  );
}

