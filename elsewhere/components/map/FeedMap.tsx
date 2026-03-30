"use client";

import {
  useEffect,
  useCallback,
  useState,
  useRef,
  useMemo,
} from "react";
import mapboxgl from "mapbox-gl";
import { createRoot, Root } from "react-dom/client";
import { Locate } from "lucide-react";
import type { FeedItem } from "@/types/feed";
import { samePlaceId } from "@/lib/placeId";
import { usePlaceStore } from "@/store/usePlaceStore";
import { capturePlaceOpened, feedItemHasPhotos } from "@/lib/analytics";

const NOVA_CENTER: [number, number] = [-77.1941, 38.8304];

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
  /**
   * When `true`, show the user dot at `userLocationForDot`. When `false`, never show it.
   * When omitted, legacy behavior: dot only after the locate control is used.
   */
  showUserLocationDot?: boolean;
  userLocationForDot?: { lat: number; lng: number };
  /** Prefetch place detail on desktop hover (e.g. before tap). */
  onPlaceMarkerHover?: (placeId: string) => void;
  /**
   * Horizontal position (0–1 from left of map) where the selected marker should sit.
   * Default 0.5 (screen center). E.g. 0.75 centers the pin in the right half of the map.
   */
  selectedMarkerScreenXRatio?: number;
}

const PADDING_PX = 48;
const MAX_ZOOM = 18;
const MIN_ZOOM = 3;
const SELECTED_MIN_ZOOM = 14;
/** Slightly closer framing when offsetting the pin (e.g. desktop feed + side panel). */
const SELECTED_FOCUS_ZOOM = 15;
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

function clearRootSafely(root: Root) {
  // Clearing content avoids cross-root unmount races during React cleanup.
  root.render(null);
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
  showUserLocationDot,
  userLocationForDot,
  onPlaceMarkerHover,
  selectedMarkerScreenXRatio,
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
  /** After a pinch (2+ touches), ignore marker pointerup for a short window — avoids selecting a pin when lifting fingers from zoom. */
  const suppressMarkerTapUntilRef = useRef(0);
  /** True once this gesture has seen 2+ fingers; stays true until all touches end (so the *first* finger's pointerup is suppressed). */
  const multiTouchGestureRef = useRef(false);
  /** Map zoom at touch pointerdown on a marker — if zoom changed before pointerup, treat as pinch/pan not a tap. */
  const markerTouchStartZoomRef = useRef<number | null>(null);

  const [legacyLocatePosition, setLegacyLocatePosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const legacyMode = showUserLocationDot === undefined;
  const effectiveUserLocation = useMemo(() => {
    if (legacyMode) return legacyLocatePosition;
    if (showUserLocationDot === false) return null;
    return userLocationForDot ?? null;
  }, [
    legacyMode,
    showUserLocationDot,
    userLocationForDot,
    legacyLocatePosition,
  ]);

  const showLocateControl = legacyMode || showUserLocationDot === true;

  const defaultCenter: [number, number] = center
    ? [center.lng, center.lat]
    : NOVA_CENTER;

  const validPlaces = useMemo(
    () => places.filter((p) => isValidCoord(p.lat, p.lng)),
    [places],
  );

  const lastEmptyCenterFlyKeyRef = useRef("");

  // -----------------------------------------------------------------------
  // 1. Create map
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) return;

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

    // Window + capture: reliably see every finger (marker pointerup often fires while a 2nd finger is still down).
    const PINCH_MARKER_SUPPRESS_MS = 320;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) multiTouchGestureRef.current = true;
    };
    const onTouchEndLike = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (multiTouchGestureRef.current) {
          suppressMarkerTapUntilRef.current =
            performance.now() + PINCH_MARKER_SUPPRESS_MS;
        }
        multiTouchGestureRef.current = false;
      }
    };
    window.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchend", onTouchEndLike, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchcancel", onTouchEndLike, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchend", onTouchEndLike, true);
      window.removeEventListener("touchcancel", onTouchEndLike, true);
      markersRef.current.forEach((tm) => {
        clearRootSafely(tm.root);
        tm.marker.remove();
      });
      markersRef.current.clear();
      if (userMarkerRef.current) {
        clearRootSafely(userMarkerRef.current.root);
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

  // Clear stuck hover (e.g. tablet touch) when tapping the map background, not a marker.
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clearHover = () => setHoveredPlaceId(null);
    map.on("click", clearHover);
    return () => {
      map.off("click", clearHover);
    };
  }, [setHoveredPlaceId, token]);

  // -----------------------------------------------------------------------
  // 3. Fit bounds when places change
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // While a place is selected, camera is driven by the "fly to selected" effect only.
    // Do not fit all markers here — otherwise when `centerVerticalOffsetPx` updates for
    // the bottom sheet, the key changes and this effect re-runs ~600ms later and zooms out.
    if (selectedPlaceId) {
      lastBoundsKeyRef.current = "";
      return;
    }

    const sorted = [...validPlaces]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
    const key = JSON.stringify(sorted);
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
  }, [validPlaces, selectedPlaceId, centerVerticalOffsetPx]);

  // When there are no place markers, follow the logical map center (e.g. user in Case 4).
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    if (validPlaces.length > 0) return;
    const flyKey = `${validPlaces.length}\u0000${center.lat.toFixed(5)}\u0000${center.lng.toFixed(5)}\u0000${zoom}`;
    if (flyKey === lastEmptyCenterFlyKeyRef.current) return;
    lastEmptyCenterFlyKeyRef.current = flyKey;
    map.flyTo({
      center: [center.lng, center.lat],
      zoom,
      duration: 600,
    });
  }, [center?.lat, center?.lng, validPlaces.length, zoom]);

  // -----------------------------------------------------------------------
  // 4. Fly to selected place
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) {
      lastFlyKeyRef.current = null;
      return;
    }
    const place = validPlaces.find((p) => samePlaceId(p.id, selectedPlaceId));
    if (!place) return;

    const ratioRaw = selectedMarkerScreenXRatio ?? 0.5;
    const ratio = Math.min(0.95, Math.max(0.05, ratioRaw));
    const w = map.getContainer().clientWidth;
    // Mapbox: offset is pixel delta from map center to where `center` should appear (x right, y down).
    const offsetX = (ratio - 0.5) * w;
    const offsetY = centerVerticalOffsetPx ? -centerVerticalOffsetPx / 2 : 0;
    const widthBucket = Math.floor(w / 64);
    const flyKey = `${selectedPlaceId}\u0000${place.lat}\u0000${place.lng}\u0000${centerVerticalOffsetPx}\u0000${ratio}\u0000${widthBucket}`;
    if (flyKey === lastFlyKeyRef.current) return;
    lastFlyKeyRef.current = flyKey;

    const currentZoom = map.getZoom();
    const useFocusZoom = Math.abs(ratio - 0.5) > 0.01;
    const minZ = useFocusZoom
      ? Math.max(SELECTED_MIN_ZOOM, SELECTED_FOCUS_ZOOM)
      : SELECTED_MIN_ZOOM;
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: currentZoom < minZ ? minZ : currentZoom,
      offset: [offsetX, offsetY],
      duration: 600,
    });
  }, [
    selectedPlaceId,
    validPlaces,
    centerVerticalOffsetPx,
    selectedMarkerScreenXRatio,
  ]);

  // -----------------------------------------------------------------------
  // 5a. Marker lifecycle (add / remove / position) — depends only on places + handlers
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(validPlaces.map((p) => p.id));
    const existing = markersRef.current;

    existing.forEach((tm, id) => {
      if (!currentIds.has(id)) {
        clearRootSafely(tm.root);
        tm.marker.remove();
        existing.delete(id);
      }
    });

    validPlaces.forEach((place) => {
      let tracked = existing.get(place.id);

      if (!tracked) {
        const { el, root } = createPinElement();

        el.addEventListener("mouseenter", () => {
          setHoveredPlaceId(place.id);
          onPlaceMarkerHover?.(place.id);
        });
        el.addEventListener("mouseleave", () => setHoveredPlaceId(null));
        el.addEventListener(
          "pointerdown",
          (e) => {
            if (e.pointerType === "touch") {
              markerTouchStartZoomRef.current = map.getZoom() ?? null;
            }
          },
          { passive: true },
        );
        // pointerup (not click): reliable on touch; stopPropagation avoids map canvas click.
        el.addEventListener("pointerup", (e) => {
          e.stopPropagation();
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (e.pointerType === "touch") {
            // Pinch: first finger lifts while second is still down — suppress window isn't set yet.
            if (multiTouchGestureRef.current) {
              markerTouchStartZoomRef.current = null;
              return;
            }
            if (performance.now() < suppressMarkerTapUntilRef.current) {
              markerTouchStartZoomRef.current = null;
              return;
            }
            const z0 = markerTouchStartZoomRef.current;
            markerTouchStartZoomRef.current = null;
            const z1 = map.getZoom();
            if (
              z0 != null &&
              z1 != null &&
              Math.abs(z1 - z0) > 0.05
            ) {
              return;
            }
          }
          capturePlaceOpened({
            source: "map",
            place_id: place.id,
            place_name: place.name,
            place_type: place.place_type,
            has_photos: feedItemHasPhotos(place),
          });
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
    });
  }, [validPlaces, onSelectPlace, setHoveredPlaceId, onPlaceMarkerHover]);

  // -----------------------------------------------------------------------
  // 5b. Marker visuals (PinContent + z-index) — selected / hover / score
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;

    validPlaces.forEach((place) => {
      const tracked = existing.get(place.id);
      if (!tracked) return;

      const selected = samePlaceId(selectedPlaceId, place.id);
      const hovered = samePlaceId(hoveredPlaceId, place.id);

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
  }, [validPlaces, selectedPlaceId, hoveredPlaceId]);

  // -----------------------------------------------------------------------
  // 6. User location marker
  // -----------------------------------------------------------------------
   
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!effectiveUserLocation) {
      if (userMarkerRef.current) {
        clearRootSafely(userMarkerRef.current.root);
        userMarkerRef.current.marker.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    if (!userMarkerRef.current) {
      const { el, root } = createPinElement();
      el.style.pointerEvents = "none";
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([effectiveUserLocation.lng, effectiveUserLocation.lat])
        .addTo(map);
      userMarkerRef.current = { marker, root };
    } else {
      userMarkerRef.current.marker.setLngLat([
        effectiveUserLocation.lng,
        effectiveUserLocation.lat,
      ]);
    }

    userMarkerRef.current.root.render(<UserLocationDot />);
  }, [effectiveUserLocation]);

  // -----------------------------------------------------------------------
  // 7. Locate button handler
  // -----------------------------------------------------------------------
  const handleLocate = useCallback(() => {
    if (!legacyMode) {
      if (userLocationForDot) {
        mapRef.current?.flyTo({
          center: [userLocationForDot.lng, userLocationForDot.lat],
          zoom: USER_LOCATION_ZOOM,
          duration: 600,
        });
      }
      return;
    }
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
        setLegacyLocatePosition(loc);
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
  }, [legacyMode, userLocationForDot]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
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

  return (
    <div className="relative h-full w-full min-h-[200px]">
      <div ref={mapContainerRef} className="h-full w-full" />
      {showLocateControl && (
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
      )}
    </div>
  );
}
