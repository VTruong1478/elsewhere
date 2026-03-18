'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Locate } from 'lucide-react';
import type { FeedItem } from '@/types/feed';
import { usePlaceStore } from '@/store/usePlaceStore';

const ATLANTA_CENTER: [number, number] = [-84.388, 33.749];

/** Default Mapbox style when NEXT_PUBLIC_MAPBOX_STYLE_URL is not set. Light, minimal POIs. */
const DEFAULT_STYLE = 'mapbox://styles/mapbox/light-v11';

/** Pin colors: 75%+ forest green, 50–74% amber, <50% brown/red, null grey */
const TIER_COLORS = {
  high: '#4F5D3F',
  medium: '#C4943A',
  low: '#A85C3A',
  none: '#9B9A91',
} as const;

function getTierColor(score: number | null): string {
  if (score == null) return TIER_COLORS.none;
  if (score >= 75) return TIER_COLORS.high;
  if (score >= 50) return TIER_COLORS.medium;
  return TIER_COLORS.low;
}

const PADDING = 48;
const MAX_ZOOM = 15;
const MIN_ZOOM = 10;
const USER_LOCATION_ZOOM = 14;

/** Mapbox uses [longitude, latitude] (GeoJSON order). Never pass [lat, lng]. */
function toLngLat(place: { lng: number; lat: number }): [number, number] {
  return [place.lng, place.lat];
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

export interface MapboxMapProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  /** Called when zoom ends (e.g. pinch). Used to sync radius with user preferences. */
  onZoomEnd?: (zoom: number) => void;
}

/**
 * Creates the marker DOM element for Mapbox. The OUTER element has no transform/transition
 * so Mapbox can position it without lag. Scale and transition are on an INNER wrapper only.
 */
function createMarkerElement(
  place: FeedItem,
  selected: boolean,
  hovered: boolean,
  onSelect: () => void,
  onMouseEnter: () => void,
  onMouseLeave: () => void
): HTMLDivElement {
  const score = place.match_score_percent;
  const color = getTierColor(score);
  const label =
    score == null || Number.isNaN(score)
      ? '--'
      : `${Math.round(Math.min(100, Math.max(0, score)))}%`;
  const scale = selected ? 1.2 : hovered ? 1.1 : 1;
  const ring = selected ? '0 0 0 3px rgba(255,255,255,0.9)' : 'none';

  // Outer: no transform, no transition — Mapbox positions this. Do not add position/transform here.
  const outer = document.createElement('div');
  outer.className = 'mapbox-marker-outer';
  outer.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 4px;
    cursor: pointer;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
  `;
  outer.setAttribute('role', 'img');
  outer.setAttribute('aria-label', `${label} match`);

  // Inner: only this layer has scale/transition so Mapbox positioning is never affected
  const inner = document.createElement('div');
  inner.className = 'mapbox-marker-inner';
  inner.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: transform 0.15s ease-out;
    transform-origin: bottom center;
    transform: scale(${scale});
  `;

  inner.innerHTML = `
    <div style="
      display: flex;
      height: 36px;
      width: 36px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      color: white;
      background-color: ${color};
      box-shadow: ${ring};
      border: 2px solid rgba(255,255,255,0.9);
      font-size: 0.75rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    ">${label}</div>
    <div style="
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 8px;
      height: 8px;
      transform: translate(-50%, 50%) rotate(45deg);
      background-color: ${color};
      border-bottom: 1px solid rgba(255,255,255,0.9);
      border-right: 1px solid rgba(255,255,255,0.9);
    "></div>
  `;

  outer.appendChild(inner);

  outer.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect();
  });
  outer.addEventListener('mouseenter', onMouseEnter);
  outer.addEventListener('mouseleave', onMouseLeave);

  return outer;
}

/** Update only the inner scalable layer and content; never touch outer position. */
function updateMarkerElement(
  el: HTMLElement,
  place: FeedItem,
  selected: boolean,
  hovered: boolean
): void {
  const score = place.match_score_percent;
  const color = getTierColor(score);
  const label =
    score == null || Number.isNaN(score)
      ? '--'
      : `${Math.round(Math.min(100, Math.max(0, score)))}%`;
  const scale = selected ? 1.2 : hovered ? 1.1 : 1;
  const ring = selected ? '0 0 0 3px rgba(255,255,255,0.9)' : 'none';

  const inner = el.querySelector('.mapbox-marker-inner') as HTMLElement | null;
  if (!inner) return;
  const circle = inner.firstElementChild as HTMLElement | null;
  const pointer = inner.lastElementChild as HTMLElement | null;

  inner.style.transform = `scale(${scale})`;
  if (circle) {
    circle.style.backgroundColor = color;
    circle.style.boxShadow = ring;
    circle.textContent = label;
  }
  if (pointer) pointer.style.backgroundColor = color;
}

export function MapboxMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  center = { lat: ATLANTA_CENTER[1], lng: ATLANTA_CENTER[0] },
  zoom = 12,
  onZoomEnd,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onZoomEndRef = useRef(onZoomEnd);
  onZoomEndRef.current = onZoomEnd;
  const { hoveredPlaceId, setHoveredPlaceId } = usePlaceStore();

  const validPlaces = useMemo(() => {
    const list: FeedItem[] = [];
    for (const p of places) {
      const lat = p.lat;
      const lng = p.lng;
      if (!isValidCoord(lat, lng)) {
        if (__DEV__) {
          console.warn('[MapboxMap] Skipping place with invalid coords:', {
            id: p.id,
            name: p.name,
            lat,
            lng,
          });
        }
        continue;
      }
      list.push(p);
    }
    return list;
  }, [places]);

  const placesKey = useMemo(
    () =>
      JSON.stringify(
        [...validPlaces]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }))
      ),
    [validPlaces]
  );

  const validPlacesRef = useRef<FeedItem[]>(validPlaces);
  validPlacesRef.current = validPlaces;

  // Fixed-length dependency arrays so React never sees a changing array size
  const depsMarkers: [boolean, string, (id: string) => void, (id: string | null) => void] = [
    mapReady,
    placesKey,
    onSelectPlace,
    setHoveredPlaceId,
  ];
  const depsUpdateStyle: [string | null, string | null, string] = [
    selectedPlaceId,
    hoveredPlaceId,
    placesKey,
  ];
  const depsFlyToSelected: [string | null] = [selectedPlaceId];
  const depsUserLocation: [{ lat: number; lng: number } | null] = [userLocation];

  const fitBounds = useCallback(() => {
    const map = mapRef.current;
    const list = validPlacesRef.current;
    if (!map || list.length === 0) return;
    if (list.length === 1) {
      const [lng, lat] = toLngLat(list[0]);
      map.setCenter([lng, lat]);
      map.setZoom(MAX_ZOOM);
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    list.forEach((p) => bounds.extend(toLngLat(p)));
    map.fitBounds(bounds, { padding: PADDING, maxZoom: MAX_ZOOM });
    const z = map.getZoom();
    if (z != null && z > MAX_ZOOM) map.setZoom(MAX_ZOOM);
    if (z != null && z < MIN_ZOOM) map.setZoom(MIN_ZOOM);
  }, []);

  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || !containerRef.current) return;

    const styleUrl =
      process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim() || DEFAULT_STYLE;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: styleUrl,
      center: toLngLat(center),
      zoom,
    });

    map.addControl(new mapboxgl.AttributionControl(), 'bottom-right');
    mapRef.current = map;
    map.once('load', () => setMapReady(true));
    const handleZoomEnd = () => {
      const z = map.getZoom();
      if (z != null && typeof onZoomEnd === 'function') onZoomEnd(z);
    };
    map.on('zoomend', handleZoomEnd);

    const container = containerRef.current;
    const resizeObserver =
      container &&
      new ResizeObserver(() => {
        map.resize();
      });
    if (container) resizeObserver?.observe(container);

    return () => {
      map.off('zoomend', handleZoomEnd);
      resizeObserver?.disconnect();
      setMapReady(false);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      initialFitDoneRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const list = validPlacesRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    list.forEach((place) => {
      const lngLat = toLngLat(place);
      if (__DEV__) {
        console.log('[MapboxMap] marker', {
          id: place.id,
          lat: place.lat,
          lng: place.lng,
          setLngLat: lngLat,
        });
      }

      const selected = selectedPlaceId === place.id;
      const hovered = hoveredPlaceId === place.id;
      const el = createMarkerElement(
        place,
        selected,
        hovered,
        () => onSelectPlace(place.id),
        () => setHoveredPlaceId(place.id),
        () => setHoveredPlaceId(null)
      );

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (!initialFitDoneRef.current && list.length > 0) {
      fitBounds();
      initialFitDoneRef.current = true;
    }
  }, depsMarkers);

  useEffect(() => {
    const list = validPlacesRef.current;
    const markers = markersRef.current;
    for (let i = 0; i < markers.length; i++) {
      const place = list[i];
      const marker = markers[i];
      if (!place || !marker) continue;
      const el = marker.getElement();
      if (!el) continue;
      updateMarkerElement(el, place, selectedPlaceId === place.id, hoveredPlaceId === place.id);
    }
  }, depsUpdateStyle);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) return;
    const place = validPlacesRef.current.find((p) => p.id === selectedPlaceId);
    if (place) {
      map.flyTo({
        center: toLngLat(place),
        zoom: Math.max(map.getZoom() ?? 14, 14),
        duration: 800,
      });
    }
  }, depsFlyToSelected);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        mapRef.current?.flyTo({
          center: toLngLat(location),
          zoom: USER_LOCATION_ZOOM,
        });
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    const el = document.createElement('div');
    el.className = 'user-location-marker';
    el.setAttribute('aria-label', 'Your location');
    el.innerHTML = `
      <div style="position:absolute;width:24px;height:24px;border-radius:9999px;border:2px solid #3E4F73;opacity:0.4;background:transparent;left:50%;top:50%;transform:translate(-50%,-50%)"></div>
      <div style="width:12px;height:12px;border-radius:9999px;background:#3E4F73;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
    `;
    el.style.cssText =
      'display:flex;align-items:center;justify-content:center;position:relative;';
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(toLngLat(userLocation))
      .addTo(mapRef.current);
    userMarkerRef.current = marker;
    return () => {
      marker.remove();
      userMarkerRef.current = null;
    };
  }, depsUserLocation);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute bottom-3 right-3 z-30">
        <button
          type="button"
          onClick={handleLocate}
          disabled={isLocating}
          className="flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface shadow-map text-text hover:bg-surface-alt disabled:opacity-60"
          aria-label={
            isLocating
              ? 'Getting your location…'
              : 'Center map on your location'
          }
          title={
            isLocating
              ? 'Getting your location…'
              : 'Center map on your location'
          }
        >
          <Locate className="h-5 w-5 text-accent" aria-hidden />
        </button>
      </div>
    </div>
  );
}
