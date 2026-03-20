"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import { createRoot, Root } from "react-dom/client";
import { Locate } from "lucide-react";
import type { FeedItem } from "@/types/feed";
import { usePlaceStore } from "@/store/usePlaceStore";

const ATLANTA_CENTER: [number, number] = [-84.388, 33.749];

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
  /**
   * After centering on a single place (or flying to selection), pan the map by this many
   * pixels downward so the marker sits higher in the viewport (e.g. above a bottom sheet).
   */
  centerVerticalOffsetPx?: number;
}

const PADDING_PX = 48;
const MAX_ZOOM = 18;
const MIN_ZOOM = 10;
const SELECTED_MIN_ZOOM = 14;
const USER_LOCATION_ZOOM = 14;

const MAPBOX_STYLE = "mapbox://styles/vtruong1478/cmmgu21ou006c01rybm1m2nrt";

// ---------------------------------------------------------------------------
// Marker DOM helpers – render React pin content into a plain DOM node so
// Mapbox can own it as a marker element.
// ---------------------------------------------------------------------------

function createPinElement(): { el: HTMLDivElement; root: Root } {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  const root = createRoot(el);
  return { el, root };
}

function PinContent({
  score,
  selected,
  hovered,
}: {
  score: number | null;
  selected: boolean;
  hovered: boolean;
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
      style={{
        transform: `scale(${scale})`,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
        transformOrigin: "bottom center",
        transition: "transform 150ms ease-out",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: ring,
          border: "2px solid rgba(255,255,255,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 10,
          lineHeight: "14px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          width: 8,
          height: 8,
          transform: "translateX(-50%) translateY(50%) rotate(45deg)",
          backgroundColor: color,
          borderRight: "1px solid rgba(255,255,255,0.9)",
          borderBottom: "1px solid rgba(255,255,255,0.9)",
        }}
      />
    </div>
  );
}

function UserLocationDot() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "2px solid #3E4F73",
          opacity: 0.4,
        }}
      />
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: "2px solid white",
          backgroundColor: "#3E4F73",
          boxShadow: "0 2px 8px rgba(47,47,47,0.5)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracked marker instance – keeps Mapbox Marker + React root together
// ---------------------------------------------------------------------------

interface TrackedMarker {
  marker: mapboxgl.Marker;
  root: Root;
  placeId: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FeedMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  center,
  zoom = 12,
  onZoomEnd,
  centerVerticalOffsetPx = 0,
}: FeedMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
  const { hoveredPlaceId, setHoveredPlaceId } = usePlaceStore();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, TrackedMarker>>(new Map());
  const userMarkerRef = useRef<{ marker: mapboxgl.Marker; root: Root } | null>(
    null,
  );
  const lastBoundsKeyRef = useRef("");
  const lastFlyKeyRef = useRef<string | null>(null);
  const lastZoomRef = useRef<number | null>(null);
  const onZoomEndRef = useRef(onZoomEnd);
  onZoomEndRef.current = onZoomEnd;

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const defaultCenter: [number, number] = center
    ? [center.lng, center.lat]
    : ATLANTA_CENTER;

  const validPlaces = useMemo(
    () => places.filter((p) => isValidCoord(p.lat, p.lng)),
    [places],
  );

  // --- Token guard ---
  if (!token) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-alt px-4 text-center text-text-secondary">
        <p className="text-body-m font-medium">
          Map unavailable: missing access token
        </p>
        <p className="text-body-s">
          Add{" "}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
          </code>{" "}
          to{" "}
          <code className="rounded bg-surface-chip px-1 py-0.5 font-mono text-ui-caption">
            .env.local
          </code>
          , then restart the dev server.
        </p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // 1. Create map
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLE,
      center: defaultCenter,
      zoom,
      projection: "mercator",
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      touchZoomRotate: true,
      maxZoom: MAX_ZOOM,
      minZoom: MIN_ZOOM,
    });

    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((tm) => {
        tm.root.unmount();
        tm.marker.remove();
      });
      markersRef.current.clear();
      if (userMarkerRef.current) {
        userMarkerRef.current.root.unmount();
        userMarkerRef.current.marker.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // -----------------------------------------------------------------------
  // 2. Zoom-end listener
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = () => {
      const z = map.getZoom();
      if (z == null) return;
      const rounded = Math.round(z * 100) / 100;
      if (lastZoomRef.current === rounded) return;
      lastZoomRef.current = rounded;
      onZoomEndRef.current?.(rounded);
    };

    map.on("moveend", handler);
    return () => {
      map.off("moveend", handler);
    };
  }, [token]);

  // -----------------------------------------------------------------------
  // 3. Fit bounds when places change
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sorted = [...validPlaces]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
    const key = `${JSON.stringify(sorted)}\u0000${centerVerticalOffsetPx}`;
    if (key === lastBoundsKeyRef.current) return;
    lastBoundsKeyRef.current = key;

    if (validPlaces.length === 0) return;

    if (validPlaces.length === 1) {
      const p = validPlaces[0];
      map.flyTo({
        center: [p.lng, p.lat],
        zoom: MAX_ZOOM,
        offset: [0, centerVerticalOffsetPx ? -centerVerticalOffsetPx / 2 : 0],
        duration: 600,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    validPlaces.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, {
      padding: PADDING_PX,
      maxZoom: MAX_ZOOM,
      duration: 600,
    });
  }, [validPlaces, centerVerticalOffsetPx]);

  // -----------------------------------------------------------------------
  // 4. Fly to selected place
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) {
      lastFlyKeyRef.current = null;
      return;
    }
    const place = validPlaces.find((p) => p.id === selectedPlaceId);
    if (!place) return;
    const flyKey = `${selectedPlaceId}\u0000${place.lat}\u0000${place.lng}\u0000${centerVerticalOffsetPx}`;
    if (flyKey === lastFlyKeyRef.current) return;
    lastFlyKeyRef.current = flyKey;

    const currentZoom = map.getZoom();
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: currentZoom < SELECTED_MIN_ZOOM ? SELECTED_MIN_ZOOM : currentZoom,
      offset: [0, centerVerticalOffsetPx ? -centerVerticalOffsetPx / 2 : 0],
      duration: 600,
    });
  }, [selectedPlaceId, validPlaces, centerVerticalOffsetPx]);

  // -----------------------------------------------------------------------
  // 5. Sync markers (add / remove / update)
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(validPlaces.map((p) => p.id));
    const existing = markersRef.current;

    // Remove stale markers
    existing.forEach((tm, id) => {
      if (!currentIds.has(id)) {
        tm.root.unmount();
        tm.marker.remove();
        existing.delete(id);
      }
    });

    // Add or update markers
    validPlaces.forEach((place) => {
      const selected = selectedPlaceId === place.id;
      const hovered = hoveredPlaceId === place.id;
      let tracked = existing.get(place.id);

      if (!tracked) {
        const { el, root } = createPinElement();

        el.addEventListener("mouseenter", () => setHoveredPlaceId(place.id));
        el.addEventListener("mouseleave", () => setHoveredPlaceId(null));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectPlace(place.id);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([place.lng, place.lat])
          .addTo(map);

        tracked = { marker, root, placeId: place.id };
        existing.set(place.id, tracked);
      } else {
        tracked.marker.setLngLat([place.lng, place.lat]);
      }

      tracked.root.render(
        <PinContent
          score={place.match_score_percent}
          selected={selected}
          hovered={hovered}
        />,
      );

      const el = tracked.marker.getElement();
      el.style.zIndex = selected ? "3" : hovered ? "2" : "1";
    });
  }, [
    validPlaces,
    selectedPlaceId,
    hoveredPlaceId,
    onSelectPlace,
    setHoveredPlaceId,
  ]);

  // -----------------------------------------------------------------------
  // 6. User location marker
  // -----------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.root.unmount();
        userMarkerRef.current.marker.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    if (!userMarkerRef.current) {
      const { el, root } = createPinElement();
      el.style.pointerEvents = "none";
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
      userMarkerRef.current = { marker, root };
    } else {
      userMarkerRef.current.marker.setLngLat([
        userLocation.lng,
        userLocation.lat,
      ]);
    }

    userMarkerRef.current.root.render(<UserLocationDot />);
  }, [userLocation]);

  // -----------------------------------------------------------------------
  // 7. Locate button handler
  // -----------------------------------------------------------------------
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateError("Geolocation is not supported");
      return;
    }
    setIsLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const loc = { lat: latitude, lng: longitude };
        setUserLocation(loc);
        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom: USER_LOCATION_ZOOM,
          duration: 600,
        });
        setIsLocating(false);
      },
      (err) => {
        setLocateError(err.message || "Could not get location");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="relative h-full w-full min-h-[200px]">
      <div ref={mapContainerRef} className="h-full w-full" />
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
        {locateError && (
          <span className="sr-only" role="alert">
            {locateError}
          </span>
        )}
      </div>
    </div>
  );
}
