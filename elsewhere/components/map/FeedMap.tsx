"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { Locate } from "lucide-react";
import type { FeedItem } from "@/types/feed";
import { usePlaceStore } from "@/store/usePlaceStore";

const ATLANTA_CENTER = { lat: 33.749, lng: -84.388 };

/** Pin colors aligned with MatchRing tiers */
const TIER_COLORS = {
  high: "#4F5D3F",
  medium: "#C4943A",
  low: "#A85C3A",
  none: "#9B9A91",
} as const;

function getTierColor(score: number | null): string {
  if (score == null || Number.isNaN(score)) return TIER_COLORS.none;
  if (score >= 75) return TIER_COLORS.high;
  if (score >= 50) return TIER_COLORS.medium;
  return TIER_COLORS.low;
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export interface FeedMapProps {
  places: FeedItem[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  /** Called when the map camera settles after zoom (for radius / prefs sync). */
  onZoomEnd?: (zoom: number) => void;
}

const PADDING_PX = 48;
const MAX_ZOOM = 15;
const MIN_ZOOM = 10;
const SELECTED_MIN_ZOOM = 14;
const USER_LOCATION_ZOOM = 14;

function MapFitBounds({ places }: { places: FeedItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || places.length === 0) return;
    const valid = places.filter((p) => isValidCoord(p.lat, p.lng));
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(MAX_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    valid.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, {
      top: PADDING_PX,
      right: PADDING_PX,
      bottom: PADDING_PX,
      left: PADDING_PX,
    });
    const listener = google.maps.event.addListener(map, "idle", () => {
      const z = map.getZoom();
      if (z != null && z > MAX_ZOOM) map.setZoom(MAX_ZOOM);
      if (z != null && z < MIN_ZOOM) map.setZoom(MIN_ZOOM);
      google.maps.event.removeListener(listener);
    });
    return () => google.maps.event.removeListener(listener);
  }, [map, places]);

  return null;
}

function MapFlyToSelected({
  places,
  selectedPlaceId,
}: {
  places: FeedItem[];
  selectedPlaceId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedPlaceId) return;
    const place = places.find((p) => p.id === selectedPlaceId);
    if (!place || !isValidCoord(place.lat, place.lng)) return;
    map.panTo({ lat: place.lat, lng: place.lng });
    const z = map.getZoom() ?? SELECTED_MIN_ZOOM;
    if (z < SELECTED_MIN_ZOOM) map.setZoom(SELECTED_MIN_ZOOM);
  }, [map, places, selectedPlaceId]);

  return null;
}

function MapZoomEndListener({ onZoomEnd }: { onZoomEnd?: (z: number) => void }) {
  const map = useMap();
  const onZoomEndRef = useRef(onZoomEnd);
  const lastZoomRef = useRef<number | null>(null);
  onZoomEndRef.current = onZoomEnd;

  useEffect(() => {
    if (!map || !onZoomEnd) return;
    const listener = map.addListener("idle", () => {
      const z = map.getZoom();
      if (z == null) return;
      if (lastZoomRef.current === z) return;
      lastZoomRef.current = z;
      onZoomEndRef.current?.(z);
    });
    return () => listener.remove();
  }, [map, onZoomEnd]);

  return null;
}

function MapMarkerContent({
  score,
  selected,
  hovered,
  onMouseEnter,
  onMouseLeave,
}: {
  score: number | null;
  selected: boolean;
  hovered: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const color = getTierColor(score);
  const scale = selected ? 1.2 : hovered ? 1.1 : 1;
  const ring = selected ? "0 0 0 3px rgba(255,255,255,0.9)" : "none";
  const label =
    score == null || Number.isNaN(score)
      ? "--"
      : `${Math.round(Math.min(100, Math.max(0, score)))}%`;

  return (
    <div
      className="relative flex origin-bottom cursor-pointer items-center justify-center transition-transform duration-150 ease-out"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="img"
      aria-label={`${label} match`}
      style={{
        transform: `scale(${scale})`,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-inverse"
        style={{
          backgroundColor: color,
          boxShadow: ring,
          border: "2px solid rgba(255,255,255,0.9)",
        }}
      >
        <span className="text-ui-label-s font-bold tabular-nums">{label}</span>
      </div>
      <div
        className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-white/90"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function UserLocationMarker() {
  return (
    <div
      className="relative flex items-center justify-center"
      role="img"
      aria-label="Your location"
    >
      <div
        className="absolute h-6 w-6 rounded-full border-2 border-accent opacity-40"
        style={{ backgroundColor: "transparent" }}
      />
      <div
        className="h-3 w-3 rounded-full border-2 border-white shadow-map"
        style={{ backgroundColor: "#3E4F73" }}
      />
    </div>
  );
}

function MapLocateControl() {
  const map = useMap();
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
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
        setError(err.message || "Could not get location");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
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
          aria-label={
            isLocating
              ? "Getting your location…"
              : "Center map on your location"
          }
          title={
            isLocating
              ? "Getting your location…"
              : "Center map on your location"
          }
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
  onZoomEnd,
}: FeedMapProps) {
  const { hoveredPlaceId, setHoveredPlaceId } = usePlaceStore();
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID";

  const validPlaces = places.filter((p) => isValidCoord(p.lat, p.lng));

  return (
    <div className="relative h-full w-full">
      <Map
        mapId={mapId}
        defaultCenter={center}
        defaultZoom={zoom}
        disableDefaultUI
        className="h-full w-full"
        gestureHandling="greedy"
      >
        <MapFitBounds places={validPlaces} />
        <MapFlyToSelected
          places={validPlaces}
          selectedPlaceId={selectedPlaceId}
        />
        <MapZoomEndListener onZoomEnd={onZoomEnd} />
        <MapLocateControl />
        {validPlaces.map((place) => {
          const score = place.match_score_percent;
          const selected = selectedPlaceId === place.id;
          const hovered = hoveredPlaceId === place.id;
          return (
            <AdvancedMarker
              key={place.id}
              position={{ lat: place.lat, lng: place.lng }}
              title={place.name}
              onClick={() => onSelectPlace(place.id)}
              zIndex={selected ? 2 : hovered ? 1 : 0}
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
  if (!apiKey?.trim()) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-alt px-4 text-center text-text-secondary">
        <p className="text-body-m font-medium">Map unavailable: missing API key</p>
        <p className="text-body-s">
          Add{" "}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>{" "}
          to{" "}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            .env.local
          </code>
          . For Advanced Markers, set{" "}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            NEXT_PUBLIC_GOOGLE_MAP_ID
          </code>{" "}
          (Map ID from Google Cloud). Get credentials from{" "}
          <a
            href="https://console.cloud.google.com/google/maps-apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Google Cloud Console
          </a>{" "}
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
