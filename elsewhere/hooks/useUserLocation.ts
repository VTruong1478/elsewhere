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
    const raw = window.localStorage.getItem(COORDS_CACHE_KEY);
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
 * Returns true if the browser's Permissions API confirms that location access
 * is already granted (i.e. no dialog will be shown). Returns false if the API
 * is unavailable, the permission is "prompt", or the query throws.
 */
async function isLocationPermissionGranted(): Promise<boolean> {
  if (!("permissions" in navigator)) return false;
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Browser geolocation for feed/map. Caches last coords in localStorage so the
 * UI can show a position quickly while a fresh fix is requested, and so coords
 * survive across tabs and browser sessions (unlike sessionStorage).
 *
 * Initial state is always `"loading"` so server and first client render match
 * (localStorage is only read after mount).
 *
 * Pass `{ skip: true }` to hold the hook in "loading" without firing the
 * permission prompt — used by the onboarding tutorial so the tutorial can be
 * the first thing that asks the user, not an automatic browser dialog.
 *
 * Pass `{ autoRequest: false }` to **not** call `getCurrentPosition` on mount.
 * The hook still applies any coords already in `localStorage` (written when
 * the user enables location on the feed). Use this on routes like `/map` so
 * the system permission dialog only appears from the feed flow (or from an
 * explicit control such as the map "locate" button).
 */
export function useUserLocation(
  {
    skip = false,
    autoRequest = true,
  }: { skip?: boolean; autoRequest?: boolean } = {},
): UserLocationState {
  const [state, setState] = useState<UserLocationState>({ status: "loading" });

  useEffect(() => {
    if (skip) return; // hold in "loading" until the caller is ready

    const cachedCoords = readCachedCoords();

    if (cachedCoords) {
      setState({
        status: "ready",
        lat: cachedCoords.lat,
        lng: cachedCoords.lng,
      });
    }

    if (!autoRequest) {
      if (!cachedCoords) {
        if (!navigator.geolocation) {
          setState({ status: "unavailable" });
        } else {
          setState({ status: "denied" });
        }
      }
      return;
    }

    if (!navigator.geolocation) {
      if (!cachedCoords) setState({ status: "unavailable" });
      return;
    }

    let cancelled = false;

    if (cachedCoords) {
      // Already have a usable position. Only refresh silently if the browser
      // has already granted location access — never re-show the permission
      // dialog to a returning visitor just to get a background position update.
      let clearRefreshTimeout: (() => void) | undefined;
      void isLocationPermissionGranted()
        .then((granted) => {
          if (cancelled || !granted) return;
          const tid = window.setTimeout(() => {
            cancelled = true;
          }, LOCATION_TIMEOUT_MS);
          clearRefreshTimeout = () => window.clearTimeout(tid);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled) return;
              window.clearTimeout(tid);
              const fresh = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              };
              try {
                window.localStorage.setItem(
                  COORDS_CACHE_KEY,
                  JSON.stringify({ lat: fresh.lat, lng: fresh.lng }),
                );
              } catch {
                // Ignore cache write failures
              }
              const movedMeters = distanceMetersBetween(cachedCoords, fresh);
              if (movedMeters >= MEANINGFUL_DISTANCE_METERS) {
                setState({ status: "ready", lat: fresh.lat, lng: fresh.lng });
              }
            },
            () => {
              if (cancelled) return;
              window.clearTimeout(tid);
              // cachedCoords already applied — no state change needed on error
            },
            { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
          );
        })
        .catch(() => {
          // Permissions query failed unexpectedly — skip silent refresh
        });
      return () => {
        cancelled = true;
        clearRefreshTimeout?.();
      };
    }

    // No cached coords — first-time flow: ask the user for permission.
    let deniedEventSent = false;
    function reportPermissionDenied() {
      if (deniedEventSent) return;
      deniedEventSent = true;
      captureEvent("location_permission_denied");
    }

    captureEvent("location_prompt_shown");

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      reportPermissionDenied();
      setState({ status: "denied" });
    }, LOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        captureEvent("location_permission_granted");
        const fresh = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        try {
          window.localStorage.setItem(
            COORDS_CACHE_KEY,
            JSON.stringify({ lat: fresh.lat, lng: fresh.lng }),
          );
        } catch {
          // Ignore cache write failures
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
        reportPermissionDenied();
        setState({ status: "denied" });
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [skip, autoRequest]);

  return state;
}
