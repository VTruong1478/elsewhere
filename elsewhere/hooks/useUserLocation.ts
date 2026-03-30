import { useEffect, useState } from "react";
import { distanceMetersBetween } from "@/lib/locationRegion";
import type { UserLocationState } from "@/lib/feedLocationContext";
import { captureEvent } from "@/lib/analytics";

const COORDS_CACHE_KEY = "elsewhere:lastCoords";
const MEANINGFUL_DISTANCE_METERS = 200;
const LOCATION_TIMEOUT_MS = 5_000;

function readCachedCoords(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(COORDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = typeof parsed?.lat === "number" ? parsed.lat : NaN;
    const lng = typeof parsed?.lng === "number" ? parsed.lng : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Browser geolocation for feed/map. Caches last coords in sessionStorage so the UI
 * can show a position quickly while a fresh fix is requested.
 *
 * Initial state is always `"loading"` so server and first client render match
 * (sessionStorage is only read after mount).
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<UserLocationState>({ status: "loading" });

  useEffect(() => {
    const cachedCoords = readCachedCoords();

    if (cachedCoords) {
      setState({
        status: "ready",
        lat: cachedCoords.lat,
        lng: cachedCoords.lng,
      });
    }

    if (!navigator.geolocation) {
      if (!cachedCoords) setState({ status: "unavailable" });
      return;
    }

    let cancelled = false;
    let deniedEventSent = false;
    function reportPermissionDenied() {
      if (deniedEventSent) return;
      deniedEventSent = true;
      captureEvent("location_permission_denied");
    }

    if (!cachedCoords) {
      captureEvent("location_prompt_shown");
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (!cachedCoords) {
        reportPermissionDenied();
        setState({ status: "denied" });
      }
    }, LOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (!cachedCoords) {
          captureEvent("location_permission_granted");
        }
        const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          window.sessionStorage.setItem(
            COORDS_CACHE_KEY,
            JSON.stringify({ lat: fresh.lat, lng: fresh.lng }),
          );
        } catch {
          // Ignore cache write failures
        }
        if (cachedCoords) {
          const movedMeters = distanceMetersBetween(cachedCoords, fresh);
          if (movedMeters >= MEANINGFUL_DISTANCE_METERS) {
            setState({ status: "ready", lat: fresh.lat, lng: fresh.lng });
          }
          return;
        }
        setState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (!cachedCoords) {
          reportPermissionDenied();
          setState({ status: "denied" });
        }
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
