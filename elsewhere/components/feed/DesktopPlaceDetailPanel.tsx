// DesktopPlaceDetailPanel.tsx

"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  X,
} from "lucide-react";
import type { FeedItem } from "@/types/feed";
import type { PlaceDetailResponse } from "@/types/placeDetail";
import { StatusDot } from "@/components/ui/StatusDot";
import { MetricTile } from "@/components/ui/MetricTile";
import { Button } from "@/components/ui/Button";
import { PlaceDetailCta } from "@/components/places/PlaceDetailCta";
import { deriveOpeningState, hasOpenLate } from "@/lib/openingHours";
import { normalizePlaceId } from "@/lib/placeId";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import {
  analyticsSourceFromPathname,
  buildRateHref,
  capturePlaceSaved,
  detailPlaceHasPhotos,
  feedItemHasPhotos,
} from "@/lib/analytics";
import { ensureAuthForGatedAction } from "@/lib/authGate";
import { tryCaptureGatedActionCompleted } from "@/lib/gatedAction";

type OpeningHoursType = Parameters<typeof deriveOpeningState>[0];

export type DesktopPlaceDetailPanelProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
  onDismiss?: () => void;
  /** Feed row for this place: instant header/metrics while detail API loads + cache warms. */
  previewFeedItem?: FeedItem | null;
};

function n(v: number | string | bigint | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return v;
}

function dominantNoiseFromCounts(
  stats: PlaceDetailResponse["place_stats"],
): "Silent" | "Quiet" | "Vibrant" | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const silent = n(stats.noise_silent);
  const quiet = n(stats.noise_quiet);
  const vibrant = n(stats.noise_vibrant);
  const max = Math.max(silent, quiet, vibrant);
  if (max === 0) return null;
  const matches = [silent === max, quiet === max, vibrant === max].filter(
    Boolean,
  ).length;
  if (matches > 1) return "Quiet";
  if (quiet === max) return "Quiet";
  if (vibrant === max) return "Vibrant";
  return "Silent";
}

function dominantVibeFromCounts(
  stats: PlaceDetailResponse["place_stats"],
): "Focused" | "Casual" | "Social" | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const focused = n(stats.vibe_focused);
  const casual = n(stats.vibe_casual);
  const social = n(stats.vibe_social);
  const max = Math.max(focused, casual, social);
  if (max === 0) return null;
  const matches = [focused === max, casual === max, social === max].filter(
    Boolean,
  ).length;
  if (matches > 1) return "Casual";
  if (casual === max) return "Casual";
  if (focused === max) return "Focused";
  return "Social";
}

function dominantTablesFromCounts(
  stats: PlaceDetailResponse["place_stats"],
): "limited" | "mixed" | "plentiful" | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const limited = n(stats.tables_limited);
  const mixed = n(stats.tables_mixed);
  const plentiful = n(stats.tables_plentiful);
  const max = Math.max(limited, mixed, plentiful);
  if (max === 0) return null;
  const matches = [limited === max, mixed === max, plentiful === max].filter(
    Boolean,
  ).length;
  if (matches > 1) return "mixed";
  if (mixed === max) return "mixed";
  if (limited === max) return "limited";
  return "plentiful";
}

function dominantOutletsFromCounts(
  stats: PlaceDetailResponse["place_stats"],
): "scarce" | "some" | "ample" | null {
  const ratingCount = n(stats.rating_count);
  if (ratingCount < 1) return null;
  const scarce = n(stats.outlets_scarce);
  const some = n(stats.outlets_some);
  const ample = n(stats.outlets_ample);
  const max = Math.max(scarce, some, ample);
  if (max === 0) return null;
  const matches = [scarce === max, some === max, ample === max].filter(
    Boolean,
  ).length;
  if (matches > 1) return "some";
  if (some === max) return "some";
  if (scarce === max) return "scarce";
  return "ample";
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function noteAuthorAvatarLetter(authorShortName: string): string {
  const t = authorShortName.trim();
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

/** Single place on the map: markers only render from `places`; match % from avg rating when available */
function feedItemForDetailMap(
  placeId: string,
  coords: { lat: number; lng: number },
  row: PlaceDetailResponse["place"] | null,
  avgOverall: number | null,
): FeedItem {
  const match =
    avgOverall != null && !Number.isNaN(avgOverall)
      ? Math.round(Math.min(5, Math.max(0, avgOverall)) * 20)
      : null;
  return {
    id: placeId,
    name: row?.name ?? "—",
    address: row?.address ?? "",
    lat: coords.lat,
    lng: coords.lng,
    place_type: row?.place_type ?? "",
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
): PlaceDetailResponse["place"] {
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

/**
 * Desktop feed (lg+): place detail content as a full-height static panel (no bottom-sheet snaps).
 */
export function DesktopPlaceDetailPanel({
  placeId,
  initialCenter,
  onDismiss,
  previewFeedItem = null,
}: DesktopPlaceDetailPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
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

  const queryClient = useQueryClient();

  const {
    data: detail,
    isLoading,
    isFetching,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: placeDetailQueryKey(normalizedId ?? "__invalid__"),
    queryFn: () => fetchPlaceDetail(normalizedId!),
    enabled: !!normalizedId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const loadError = !normalizedId
    ? "Place not found"
    : isError
      ? queryError instanceof Error
        ? queryError.message
        : "Could not load place"
      : null;

  const { data: photoUrls = [] } = useQuery({
    queryKey: ["place-user-photos", normalizedId ?? "__invalid__"],
    queryFn: async () => {
      const res = await fetch(
        `/api/places/${encodeURIComponent(normalizedId!)}/user-photos`,
      );
      if (!res.ok) return [];
      const body: unknown = await res.json();
      if (
        body &&
        typeof body === "object" &&
        "urls" in body &&
        Array.isArray((body as { urls: unknown }).urls)
      ) {
        return (body as { urls: string[] }).urls.filter(
          (u): u is string => typeof u === "string" && u.length > 0,
        );
      }
      return [];
    },
    enabled: !!normalizedId,
    staleTime: 60 * 1000,
  });

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  /** Bumps when opening or jumping so layout effect can scroll even if already open. */
  const [photoViewerNonce, setPhotoViewerNonce] = useState(0);
  const photoViewerInitialRef = useRef<number | null>(null);
  const photoViewerStripRef = useRef<HTMLDivElement>(null);
  const photoSwipeDismissRef = useRef<{
    active: boolean;
    mode: "undecided" | "vertical" | "horizontal";
    startY: number;
    startX: number;
    pointerId: number | null;
  }>({
    active: false,
    mode: "undecided",
    startY: 0,
    startX: 0,
    pointerId: null,
  });

  const PHOTO_DISMISS_AXIS_LOCK_PX = 10;
  const PHOTO_DISMISS_MIN_DY = 72;

  function openPhotoViewer(index: number) {
    photoViewerInitialRef.current = index;
    setPhotoViewerIndex(index);
    setPhotoViewerOpen(true);
    setPhotoViewerNonce((n) => n + 1);
  }

  function onPhotoViewerStripScroll() {
    const el = photoViewerStripRef.current;
    if (!el || !photoViewerOpen) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setPhotoViewerIndex(Math.max(0, Math.min(photoUrls.length - 1, i)));
  }

  const goPhotoViewerStep = useCallback(
    (delta: number) => {
      const el = photoViewerStripRef.current;
      if (!el || photoUrls.length <= 1) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const current = Math.round(el.scrollLeft / w);
      const next = Math.max(0, Math.min(photoUrls.length - 1, current + delta));
      el.scrollTo({ left: next * w, behavior: "smooth" });
      setPhotoViewerIndex(next);
    },
    [photoUrls.length],
  );

  function onPhotoSlidePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    photoSwipeDismissRef.current = {
      active: true,
      mode: "undecided",
      startY: e.clientY,
      startX: e.clientX,
      pointerId: e.pointerId,
    };
  }

  function onPhotoSlidePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const s = photoSwipeDismissRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;

    const dy = e.clientY - s.startY;
    const dx = e.clientX - s.startX;

    if (s.mode === "undecided") {
      if (
        Math.abs(dy) < PHOTO_DISMISS_AXIS_LOCK_PX &&
        Math.abs(dx) < PHOTO_DISMISS_AXIS_LOCK_PX
      ) {
        return;
      }
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.05) {
        s.mode = "vertical";
      } else {
        s.mode = "horizontal";
      }
    }

    if (s.mode === "vertical" && dy > 0) {
      e.preventDefault();
    }
  }

  function onPhotoSlidePointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const s = photoSwipeDismissRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;

    const dy = e.clientY - s.startY;
    if (s.mode === "vertical" && dy >= PHOTO_DISMISS_MIN_DY) {
      setPhotoViewerOpen(false);
    }
    photoSwipeDismissRef.current = {
      active: false,
      mode: "undecided",
      startY: 0,
      startX: 0,
      pointerId: null,
    };
  }

  useEffect(() => {
    if (!photoViewerOpen) {
      photoSwipeDismissRef.current = {
        active: false,
        mode: "undecided",
        startY: 0,
        startX: 0,
        pointerId: null,
      };
    }
  }, [photoViewerOpen]);

  useLayoutEffect(() => {
    if (!photoViewerOpen || photoViewerInitialRef.current === null) return;
    const targetIdx = photoViewerInitialRef.current;
    const el = photoViewerStripRef.current;

    const applyScroll = () => {
      if (!el || photoViewerInitialRef.current === null) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      photoViewerInitialRef.current = null;
      el.scrollTo({ left: targetIdx * w, behavior: "auto" });
      setPhotoViewerIndex(targetIdx);
    };

    applyScroll();
    if (photoViewerInitialRef.current !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(applyScroll);
      });
    }
  }, [photoViewerOpen, photoViewerNonce]);

  useEffect(() => {
    if (!photoViewerOpen) return;
    function onResize() {
      const el = photoViewerStripRef.current;
      if (!el) return;
      const w = el.clientWidth;
      el.scrollTo({ left: photoViewerIndex * w, behavior: "auto" });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [photoViewerOpen, photoViewerIndex]);

  useEffect(() => {
    if (!photoViewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setPhotoViewerOpen(false);
        return;
      }
      if (photoUrls.length <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPhotoViewerStep(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goPhotoViewerStep(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoViewerOpen, photoUrls.length, goPhotoViewerStep]);

  useEffect(() => {
    if (!photoViewerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [photoViewerOpen]);

  useEffect(() => {
    if (photoViewerOpen && photoUrls.length === 0) setPhotoViewerOpen(false);
  }, [photoViewerOpen, photoUrls.length]);

  /** Portal target so the viewer stacks above map chrome (e.g. z-40 back button) that is a *sibling* of this component in the DOM. */
  const [photoPortalTarget, setPhotoPortalTarget] =
    useState<HTMLElement | null>(null);
  useEffect(() => {
    setPhotoPortalTarget(document.body);
  }, []);

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

  const coords =
    place && isFinite(Number(place.lat)) && isFinite(Number(place.lng))
      ? { lat: Number(place.lat), lng: Number(place.lng) }
      : initialCenter;
  const avgOverall =
    stats?.avg_overall_rating != null
      ? typeof stats.avg_overall_rating === "number"
        ? stats.avg_overall_rating
        : Number(stats.avg_overall_rating)
      : previewMatches &&
          previewFeedItem?.match_score_percent != null &&
          !Number.isNaN(previewFeedItem.match_score_percent)
        ? previewFeedItem.match_score_percent / 20
        : null;

  /** Same signal as PlaceCard (`user_has_rated`): detail API `my_rating`, else feed preview while loading. */
  const userHasRated = useMemo(() => {
    if (detail != null) return !!detail.my_rating;
    if (previewMatches && previewFeedItem)
      return !!previewFeedItem.user_has_rated;
    return false;
  }, [detail, previewMatches, previewFeedItem]);

  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (detail != null) {
      setIsSaved(detail.is_saved);
    } else if (previewMatches && previewFeedItem) {
      setIsSaved(!!previewFeedItem.is_favorited);
    } else {
      setIsSaved(false);
    }
  }, [detail, previewMatches, previewFeedItem]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/saved", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: normalizedId! }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to save place",
        );
      }
    },
    onMutate: async () => {
      setIsSaved(true);
      queryClient.setQueryData<FeedItem[] | undefined>(
        ["saved-places"],
        (prev) => {
          if (!Array.isArray(prev) || !normalizedId) return prev;
          if (prev.some((p) => p.id === normalizedId)) return prev;
          const row: FeedItem =
            previewMatches && previewFeedItem
              ? { ...previewFeedItem, is_favorited: true }
              : {
                  ...feedItemForDetailMap(
                    normalizedId,
                    coords,
                    place ?? null,
                    avgOverall,
                  ),
                  is_favorited: true,
                };
          return [row, ...prev];
        },
      );
    },
    onSuccess: () => {
      if (!normalizedId) return;
      tryCaptureGatedActionCompleted({
        action_type: "save_place",
        place_id: normalizedId,
      });
      capturePlaceSaved(
        {
          id: normalizedId,
          name: previewFeedItem?.name ?? detail?.place?.name ?? "",
          place_type: previewFeedItem?.place_type ?? detail?.place?.place_type,
          has_photos:
            previewMatches && previewFeedItem
              ? feedItemHasPhotos(previewFeedItem)
              : detailPlaceHasPhotos(detail?.place ?? null),
        },
        analyticsSourceFromPathname(pathname),
      );
    },
    onError: () => {
      setIsSaved(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/saved/${normalizedId!}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to unsave place",
        );
      }
    },
    onMutate: async () => {
      setIsSaved(false);
      queryClient.setQueryData<FeedItem[] | undefined>(
        ["saved-places"],
        (prev) =>
          Array.isArray(prev) && normalizedId
            ? prev.filter((p) => p.id !== normalizedId)
            : prev,
      );
    },
    onError: () => {
      setIsSaved(true);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

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
      const closes = opening.closes_at ?? "";
      if (!opening.open_now) {
        return {
          status: "closed" as const,
          label: "Closed",
          subLabel:
            ratingCount > 0
              ? `· ${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`
              : undefined,
        };
      }
      if (opening.closing_soon && closes) {
        return {
          status: "closing-soon" as const,
          label: `Closing soon (${closes})`,
          subLabel: `· ${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`,
        };
      }
      if (opening.open_now && closes) {
        return {
          status: "open" as const,
          label: `Open until ${closes}`,
          subLabel: `· ${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`,
        };
      }
      if (openLate) {
        return {
          status: "open" as const,
          label: closes ? `Open until ${closes}` : "Open",
          subLabel: `· ${ratingCount} ratings`,
        };
      }
      return {
        status: "open" as const,
        label: "Open",
        subLabel: `· ${ratingCount} ratings`,
      };
    }
    if (previewMatches && previewFeedItem) {
      const sub = ratingCount > 0 ? `· ${ratingCount} ratings` : undefined;
      if (!previewFeedItem.open_now) {
        return { status: "closed" as const, label: "Closed", subLabel: sub };
      }
      if (previewFeedItem.closing_soon && previewFeedItem.closes_at) {
        return {
          status: "closing-soon" as const,
          label: `Closing soon (${previewFeedItem.closes_at})`,
          subLabel: sub,
        };
      }
      if (previewFeedItem.open_now && previewFeedItem.closes_at) {
        return {
          status: "open" as const,
          label: `Open until ${previewFeedItem.closes_at}`,
          subLabel: sub,
        };
      }
      if (previewFeedItem.open_late) {
        return {
          status: "open" as const,
          label: previewFeedItem.closes_at
            ? `Open until ${previewFeedItem.closes_at}`
            : "Open",
          subLabel: sub,
        };
      }
      return { status: "open" as const, label: "Open", subLabel: sub };
    }
    return {
      status: "closed" as const,
      label: "—",
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

  const detailNotes = useMemo(
    () => (Array.isArray(detail?.notes) ? detail.notes : []),
    [detail],
  );

  if (isLoading && !previewMatches) {
    return (
      <div className="pointer-events-none flex min-h-0 flex-1 flex-col overflow-hidden rounded-radius-md bg-surface shadow-map">
        <div className="shrink-0 px-16 pt-16 pb-8">
          <div
            className="h-8 max-w-[200px] rounded-radius-md bg-surface-alt animate-pulse"
            aria-hidden
          />
        </div>
        <div className="min-h-0 flex-1 px-16">
          <div className="h-32 max-w-[280px] rounded-radius-sm bg-surface-alt animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-radius-md bg-background shadow-map">
        <div className="shrink-0 px-16 pt-16">
          <header className="shrink-0">
            <div className="flex items-start justify-between gap-8">
              <h2 className="min-w-0 flex-1 font-lora text-heading-l text-text">
                {place?.name ?? (loadError ? "Unable to load" : "—")}
              </h2>
              <div className="flex shrink-0 items-center gap-4">
                {place && normalizedId ? (
                  <Button
                    variant="secondaryIcon"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void (async () => {
                        if (isSaved) {
                          unsaveMutation.mutate();
                          return;
                        }
                        const returnPath =
                          typeof window !== "undefined"
                            ? `${window.location.pathname}${window.location.search}`
                            : "/feed";
                        if (
                          !(await ensureAuthForGatedAction(router.push, {
                            action_type: "save_place",
                            source: analyticsSourceFromPathname(pathname),
                            place_id: normalizedId!,
                            place_name: place.name,
                            place_type:
                              previewFeedItem?.place_type ??
                              place.place_type ??
                              undefined,
                            has_photos:
                              previewMatches && previewFeedItem
                                ? feedItemHasPhotos(previewFeedItem)
                                : detailPlaceHasPhotos(detail?.place ?? null),
                            returnPath,
                          }))
                        ) {
                          return;
                        }
                        saveMutation.mutate();
                      })();
                    }}
                    className="shrink-0"
                    disabled={
                      saveMutation.isPending || unsaveMutation.isPending
                    }
                    aria-label={
                      isSaved
                        ? `Remove ${place.name} from saved places`
                        : `Save ${place.name}`
                    }
                    aria-pressed={isSaved}
                  >
                    <Bookmark
                      size={18}
                      aria-hidden
                      fill={isSaved ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={2}
                    />
                  </Button>
                ) : null}
                {onDismiss ? (
                  <Button
                    variant="secondaryIcon"
                    type="button"
                    onClick={() => onDismiss()}
                    className="shrink-0"
                    aria-label="Close place details"
                  >
                    <X size={18} strokeWidth={2} aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
            {isFetching && previewMatches ? (
              <p
                className="mt-4 text-body-s text-text-tertiary"
                aria-live="polite"
              >
                Updating…
              </p>
            ) : null}
            <div>
              {place && status ? (
                <StatusDot
                  status={status.status}
                  label={status.label}
                  subLabel={status.subLabel}
                />
              ) : null}
            </div>
          </header>
        </div>

        <div className="mt-8 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-16 scrollbar-hide [-webkit-overflow-scrolling:touch] flex flex-col">
          {loadError && !place ? (
            <p className="text-body-m text-text-secondary pr-4">{loadError}</p>
          ) : null}
          {loadError && place ? (
            <p className="text-body-s text-text-tertiary pr-4 pb-8">
              {loadError}
            </p>
          ) : null}
          {place ? (
            <>
              {photoUrls.length > 0 && (
                <div className="pb-12">
                  <div className="flex gap-8 overflow-x-auto scrollbar-hide pb-8">
                    {photoUrls.map((src, idx) => (
                      <button
                        key={`${src}-${idx}`}
                        type="button"
                        onClick={() => openPhotoViewer(idx)}
                        aria-label={`View photo ${idx + 1} of ${photoUrls.length}`}
                        className="shrink-0 rounded-radius-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <img
                          src={src}
                          alt=""
                          className="pointer-events-none h-[96px] w-[128px] rounded-radius-md object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid min-w-0 grid-cols-2 gap-2 pb-12 sm:grid-cols-4">
                <MetricTile type="noise" value={dominantNoise} />
                <MetricTile type="vibes" value={dominantVibe} />
                <MetricTile type="tables" value={dominantTables} />
                <MetricTile type="outlets" value={dominantOutlets} />
              </div>

              <div className="min-w-0 pb-8">
                <div className="text-heading-m text-text font-bold">
                  Notes &amp; Tips
                </div>
                {detailNotes.length > 0 ? (
                  <div className="mt-8 space-y-8">
                    {detailNotes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-radius-md bg-surface p-16"
                      >
                        <div className="flex items-center justify-between gap-8">
                          <div
                            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-ui-label-s font-bold text-text-inverse"
                            aria-hidden
                          >
                            {noteAuthorAvatarLetter(note.author_short_name)}
                          </div>
                          <div className="flex min-w-0 flex-1  gap-8">
                            <span className="truncate text-ui-label-s font-bold text-text">
                              {note.author_short_name}
                            </span>
                            <span
                              className="shrink-0 text-ui-label-s font-normal text-text-tertiary"
                              aria-hidden
                            >
                              ·
                            </span>
                            <time
                              className="shrink-0 text-ui-label-s font-normal text-text-tertiary"
                              dateTime={note.created_at}
                            >
                              {timeAgo(note.created_at)}
                            </time>
                          </div>
                        </div>
                        <div className="mt-8 text-body-m text-text">
                          {note.notes}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-8 text-body-s text-text-tertiary">
                    No notes yet.
                  </div>
                )}
              </div>

              {stats !== null && ratingCount === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center min-h-[160px]">
                  <NotebookPen
                    className="text-text-tertiary mb-4"
                    size={48}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <p className="text-center text-heading-m text-text">
                    Be the first to rate this place!
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        <PlaceDetailCta
          dock="panel"
          className="pointer-events-auto"
          userHasRated={userHasRated}
          rateHref={buildRateHref(
            normalizedId ?? placeId,
            place?.name ?? "This place",
            analyticsSourceFromPathname(pathname),
            pathname ?? "/feed",
          )}
          rateGate={
            normalizedId
              ? {
                  place_id: normalizedId,
                  place_name: place?.name ?? "",
                  source: analyticsSourceFromPathname(pathname),
                  place_type:
                    previewFeedItem?.place_type ??
                    detail?.place?.place_type ??
                    undefined,
                  has_photos:
                    previewMatches && previewFeedItem
                      ? feedItemHasPhotos(previewFeedItem)
                      : detailPlaceHasPhotos(detail?.place ?? null),
                }
              : undefined
          }
          onShare={async () => {
            const url = `${window.location.origin}/places/${placeId}`;
            if (navigator.share) {
              try {
                await navigator.share({ url, title: place?.name ?? "" });
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
            window.open(url, "_blank", "noopener,noreferrer");
          }}
        />
      </div>

      {photoPortalTarget && photoViewerOpen && photoUrls.length > 0
        ? createPortal(
            <div
              className="pointer-events-auto fixed inset-0 z-60 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label="Place photos"
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label="Dismiss photo viewer"
                className="absolute inset-0 z-0 min-h-full w-full cursor-default border-0 modal-overlay p-0"
                onClick={() => setPhotoViewerOpen(false)}
              />
              <div className="relative z-10 flex min-h-0 w-full min-w-0 flex-1 flex-col pointer-events-none pt-[max(12px,env(safe-area-inset-top,0px))]">
                <div className="pointer-events-auto flex min-h-0 min-w-0 w-full flex-[1_1_0] flex-col">
                  <div className="grid min-h-0 min-w-0 w-full flex-[1_1_0] grid-cols-12 px-16">
                    <div className="col-span-12 grid min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 sm:col-start-2 sm:col-span-10 sm:gap-x-3 lg:gap-x-4">
                      {photoUrls.length > 1 ? (
                        <div className="flex min-h-0 items-center justify-end self-center">
                          <Button
                            variant="secondaryIcon"
                            type="button"
                            aria-label="Previous photo"
                            className="shadow-map"
                            disabled={photoViewerIndex <= 0}
                            onClick={() => goPhotoViewerStep(-1)}
                          >
                            <ChevronLeft
                              size={24}
                              strokeWidth={2}
                              aria-hidden
                            />
                          </Button>
                        </div>
                      ) : (
                        <div className="w-0 min-w-0" aria-hidden />
                      )}
                      <div className="flex min-h-0 min-w-0 flex-col">
                        <div className="flex shrink-0 justify-end pb-8">
                          <Button
                            variant="secondaryIcon"
                            type="button"
                            onClick={() => setPhotoViewerOpen(false)}
                            aria-label="Close photo viewer"
                            className="shadow-map"
                          >
                            <X size={20} strokeWidth={2} aria-hidden />
                          </Button>
                        </div>
                        <div
                          ref={photoViewerStripRef}
                          onScroll={onPhotoViewerStripScroll}
                          className="flex h-[min(58dvh,520px)] min-h-0 w-full min-w-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide [-webkit-overflow-scrolling:touch] sm:h-[min(52dvh,480px)]"
                        >
                          {photoUrls.map((src, idx) => (
                            <div
                              key={`viewer-${src}-${idx}`}
                              className="flex h-full w-full min-w-full shrink-0 snap-start touch-pan-x items-center justify-center px-4 sm:px-8"
                              onPointerDown={onPhotoSlidePointerDown}
                              onPointerMove={onPhotoSlidePointerMove}
                              onPointerUp={onPhotoSlidePointerEnd}
                              onPointerCancel={onPhotoSlidePointerEnd}
                            >
                              <img
                                src={src}
                                alt=""
                                className="max-h-full w-full max-w-full rounded-radius-sm object-contain"
                                draggable={false}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      {photoUrls.length > 1 ? (
                        <div className="flex min-h-0 items-center justify-start self-center">
                          <Button
                            variant="secondaryIcon"
                            type="button"
                            aria-label="Next photo"
                            className="shadow-map"
                            disabled={photoViewerIndex >= photoUrls.length - 1}
                            onClick={() => goPhotoViewerStep(1)}
                          >
                            <ChevronRight
                              size={24}
                              strokeWidth={2}
                              aria-hidden
                            />
                          </Button>
                        </div>
                      ) : (
                        <div className="w-0 min-w-0" aria-hidden />
                      )}
                    </div>
                  </div>
                  <div className="grid w-full shrink-0 grid-cols-12 px-16 pb-[max(24px,env(safe-area-inset-bottom,16px))] pt-10">
                    <p
                      className="col-span-12 whitespace-normal break-words text-center text-ui-label-l tabular-nums text-text-inverse [text-shadow:0_1px_2px_rgba(0,0,0,0.65)] sm:col-start-2 sm:col-span-10"
                      aria-live="polite"
                    >
                      {photoViewerIndex + 1} / {photoUrls.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            photoPortalTarget,
          )
        : null}
    </div>
  );
}
