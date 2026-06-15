"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, X } from "lucide-react";
import type { FeedItem } from "@/types/feed";
import type { PlaceDetailResponse } from "@/types/placeDetail";
import { FeedMap } from "@/components/map/FeedMap";
import { StatusDot } from "@/components/ui/StatusDot";
import { MetricTile } from "@/components/ui/MetricTile";
import { Button } from "@/components/ui/Button";
import { PlaceDetailCta } from "@/components/places/PlaceDetailCta";
import { deriveOpeningState, hasOpenLate } from "@/lib/openingHours";
import { normalizePlaceId } from "@/lib/placeId";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import { usePlaceStore } from "@/store/usePlaceStore";
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

type PlaceDetailMobileProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
  renderMap?: boolean;
  initialSnap?: "full" | "mid" | "peek";
  onDismiss?: () => void;
  /** Feed row for this place (map tab): instant header/metrics while detail API loads + cache warms. */
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

export function PlaceDetailMobile({
  placeId,
  initialCenter,
  renderMap = true,
  initialSnap = "mid",
  onDismiss,
  previewFeedItem = null,
}: PlaceDetailMobileProps) {
  const DETAIL_MAP_ZOOM = 15;
  const pathname = usePathname();
  const router = useRouter();
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

  useEffect(() => {
    if (!renderMap) return;
    setSelectedPlaceId(placeId);
  }, [placeId, setSelectedPlaceId, renderMap]);

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
      const el = photoViewerStripRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const current = Math.round(el.scrollLeft / w);
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.max(0, current - 1);
        el.scrollTo({ left: next * w, behavior: "smooth" });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(photoUrls.length - 1, current + 1);
        el.scrollTo({ left: next * w, behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoViewerOpen, photoUrls.length]);

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

  // Snap points (mobile/tablet only page, so we can rely on window dimensions after mount)
  const [heights, setHeights] = useState<{
    full: number;
    mid: number;
    peek: number;
    midTy: number;
    peekTy: number;
    maxTy: number;
  } | null>(null);
  const DISMISS_DRAG_BUFFER_PX = 80;
  const DISMISS_THRESHOLD_PX = 40;
  // Layout effect so `heights` is committed before the first paint — together with the
  // initial-`translateY` layout effect below, this guarantees the sheet paints directly
  // at the `initialSnap` position (mid by default) instead of flashing at full (ty=0)
  // and animating down on mount.
  useLayoutEffect(() => {
    function recalc() {
      const h = window.innerHeight;
      // Peek: name/status + handle (slightly taller than minimal strip so header stays readable)
      const peek = Math.round(h * 0.32);
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
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  const [translateY, setTranslateY] = useState(0);
  const [isInitialSnapReady, setIsInitialSnapReady] = useState(false);
  const translateYRef = useRef(0);
  useEffect(() => {
    translateYRef.current = translateY;
  }, [translateY]);
  const isDraggingRef = useRef(false);
  const sheetInnerRef = useRef<HTMLDivElement>(null);
  const sheetMetaRef = useRef<HTMLDivElement>(null);
  const sheetMetaDragRef = useRef(false);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const sheetDragCleanupRef = useRef<(() => void) | null>(null);

  const dragStartYRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragStartTyRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const sheetDragPhaseRef = useRef<"idle" | "slop" | "dragging" | "cancelled">(
    "idle",
  );

  // Pair with the `heights` layout effect: commit the initial snap position before
  // paint so the sheet appears directly at `initialSnap` (mid by default) instead of
  // flashing at full (ty=0) and animating down.
  useLayoutEffect(() => {
    if (!heights) return;
    const ty =
      initialSnap === "full"
        ? 0
        : initialSnap === "peek"
          ? heights.peekTy
          : heights.midTy;
    setTranslateY(ty);
    setIsInitialSnapReady(true);
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

  function shouldIgnoreSheetDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    return !!target.closest(
      "button, a[href], input, textarea, select, [data-sheet-drag-ignore]",
    );
  }

  function endSheetDragSession() {
    sheetDragCleanupRef.current?.();
    sheetDragCleanupRef.current = null;
    sheetDragPhaseRef.current = "idle";
    pointerIdRef.current = null;
    isDraggingRef.current = false;
    sheetMetaDragRef.current = false;
  }

  function onSheetPointerDownCapture(e: ReactPointerEvent<HTMLDivElement>) {
    if (!heights) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (shouldIgnoreSheetDragTarget(e.target)) return;

    endSheetDragSession();

    pointerIdRef.current = e.pointerId;
    sheetMetaDragRef.current = !!(
      sheetMetaRef.current &&
      e.target instanceof Node &&
      sheetMetaRef.current.contains(e.target)
    );
    sheetDragPhaseRef.current = "slop";
    dragStartYRef.current = e.clientY;
    dragStartXRef.current = e.clientX;
    dragStartTyRef.current = translateYRef.current;
    dragStartScrollTopRef.current = sheetScrollRef.current?.scrollTop ?? 0;

    const onMove = (ev: PointerEvent) => {
      if (!heights) return;
      if (ev.pointerId !== pointerIdRef.current) return;

      const dy = ev.clientY - dragStartYRef.current;
      const dx = ev.clientX - dragStartXRef.current;

      if (sheetDragPhaseRef.current === "slop") {
        if (Math.abs(dx) + Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 8) {
          sheetDragPhaseRef.current = "cancelled";
          endSheetDragSession();
          return;
        }
        sheetDragPhaseRef.current = "dragging";
        isDraggingRef.current = true;
        const captureEl =
          sheetMetaDragRef.current && sheetMetaRef.current
            ? sheetMetaRef.current
            : sheetInnerRef.current;
        captureEl?.setPointerCapture(ev.pointerId);
      }

      if (sheetDragPhaseRef.current !== "dragging") return;

      ev.preventDefault();

      if (dragStartTyRef.current > 0) {
        setTranslateY(clampTy(dragStartTyRef.current + dy));
        return;
      }

      // Handle + title/status: pull down moves the sheet to mid/peek without relying on
      // scroll-view overscroll (more reliable on touch, especially at full snap).
      if (sheetMetaDragRef.current && dy > 0) {
        setTranslateY(clampTy(dy));
        return;
      }

      const scrollEl = sheetScrollRef.current;
      if (!scrollEl) return;
      const maxScroll = Math.max(
        0,
        scrollEl.scrollHeight - scrollEl.clientHeight,
      );
      const newScroll = dragStartScrollTopRef.current - dy;
      if (newScroll < 0) {
        scrollEl.scrollTop = 0;
        setTranslateY(clampTy(-newScroll));
      } else if (newScroll > maxScroll) {
        scrollEl.scrollTop = maxScroll;
        setTranslateY(0);
      } else {
        scrollEl.scrollTop = newScroll;
        setTranslateY(0);
      }
    };

    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerIdRef.current) return;

      const wasDragging = sheetDragPhaseRef.current === "dragging";
      const startTy = dragStartTyRef.current;
      const startScroll = dragStartScrollTopRef.current;
      const startY = dragStartYRef.current;

      const captureReleaseEl =
        sheetMetaDragRef.current && sheetMetaRef.current
          ? sheetMetaRef.current
          : sheetInnerRef.current;
      try {
        captureReleaseEl?.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }

      endSheetDragSession();

      if (!wasDragging || !heights) return;

      const dy = ev.clientY - startY;
      let finalTy: number;

      if (startTy > 0) {
        finalTy = clampTy(startTy + dy);
      } else {
        const scrollEl = sheetScrollRef.current;
        if (!scrollEl) {
          finalTy = 0;
        } else {
          const maxScroll = Math.max(
            0,
            scrollEl.scrollHeight - scrollEl.clientHeight,
          );
          const newScroll = startScroll - dy;
          if (newScroll < 0) {
            scrollEl.scrollTop = 0;
            finalTy = clampTy(-newScroll);
          } else if (newScroll > maxScroll) {
            scrollEl.scrollTop = maxScroll;
            finalTy = 0;
          } else {
            scrollEl.scrollTop = newScroll;
            finalTy = 0;
          }
        }
      }

      if (onDismiss && finalTy > heights.peekTy + DISMISS_THRESHOLD_PX) {
        onDismiss();
        return;
      }
      const idx = pickSnap(finalTy);
      snapTo(idx);
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);

    sheetDragCleanupRef.current = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };
  }

  useEffect(() => {
    return () => {
      sheetDragCleanupRef.current?.();
      sheetDragCleanupRef.current = null;
      sheetDragPhaseRef.current = "idle";
      pointerIdRef.current = null;
      isDraggingRef.current = false;
    };
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
          place_type:
            previewFeedItem?.place_type ?? detail?.place?.place_type,
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
          subLabel: `· ${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`,
        };
      }
      return {
        status: "open" as const,
        label: "Open",
        subLabel: `· ${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`,
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
  const mapCenter = coords;
  const mapZoom = DETAIL_MAP_ZOOM;
  const mapSelectedPlaceId = placeId;
  const mapInstanceKey = `detail-${placeId}`;

  if (isLoading && !previewMatches) {
    // No cache + no feed preview: skeleton while the first fetch runs.
    return (
      <div
        className={
          renderMap ? "fixed inset-0" : "absolute inset-0 pointer-events-none"
        }
      >
        {renderMap && (
          <div className="absolute inset-0 pointer-events-auto">
            <FeedMap
              key={mapInstanceKey}
              places={[
                feedItemForDetailMap(placeId, initialCenter, null, null),
              ]}
              selectedPlaceId={mapSelectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              center={mapCenter}
              zoom={mapZoom}
              centerVerticalOffsetPx={mapCenterOffsetPx}
              allowPinFitBounds
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
    <div
      className={
        renderMap
          ? "fixed inset-0 overflow-hidden"
          : "absolute inset-0 overflow-hidden pointer-events-none"
      }
    >
      {renderMap && (
        <div className="absolute inset-0 pointer-events-auto">
          <FeedMap
            key={mapInstanceKey}
            places={mapPlaces}
            selectedPlaceId={mapSelectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
            center={mapCenter}
            zoom={mapZoom}
            centerVerticalOffsetPx={mapCenterOffsetPx}
            allowPinFitBounds
          />
        </div>
      )}

      {/* Backdrop: only for full-screen detail flow. On map-tab overlay, allow map taps through. */}
      {renderMap ? (
        <button
          type="button"
          aria-label="Close place details"
          onClick={() => onDismiss?.()}
          className={`absolute inset-0 bg-black/0 ${onDismiss ? "pointer-events-auto" : "pointer-events-none"}`}
        />
      ) : null}

      {/* Bottom sheet */}
      <div
        className={[
          renderMap ? "fixed" : "absolute",
          "pointer-events-auto bottom-0 left-0 right-0 z-30 overflow-hidden rounded-t-radius-md bg-background shadow-map",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          height: heights?.full ?? "auto",
          transform: `translateY(${translateY}px)`,
          transition: isDraggingRef.current || !isInitialSnapReady
            ? "none"
            : "transform 260ms ease-out",
          visibility: isInitialSnapReady ? "visible" : "hidden",
        }}
      >
        <div
          ref={sheetInnerRef}
          className="flex h-full flex-col"
          onPointerDownCapture={onSheetPointerDownCapture}
        >
          {/* Non-scroll chrome: drag handle + title/status — pull down from full to mid/peek */}
          <div ref={sheetMetaRef} className="shrink-0 touch-none">
            <div
              className="flex w-full shrink-0 justify-center pt-12 pb-8"
              aria-hidden={false}
            >
              <div
                role="presentation"
                aria-hidden
                className="h-4 w-40 rounded-radius-md bg-surface-alt"
              />
            </div>

            <div className="px-16">
              <header className="shrink-0">
                <div className="flex items-start justify-between gap-8">
                  <h2 className="min-w-0 flex-1 font-lora text-heading-l text-text">
                    {place?.name ?? (loadError ? "Unable to load" : "—")}
                  </h2>
                  {place && normalizedId ? (
                    <Button
                      variant="secondaryIcon"
                      type="button"
                      data-sheet-drag-ignore
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
          </div>

          <div
            ref={sheetScrollRef}
            className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-16 scrollbar-hide [-webkit-overflow-scrolling:touch] pb-[240px]"
          >
            {loadError && !place ? (
              <p className="text-body-m text-text-secondary pr-4">
                {loadError}
              </p>
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

                <div className="grid grid-cols-4 gap-2 pb-12">
                  <MetricTile type="noise" value={dominantNoise} />
                  <MetricTile type="vibes" value={dominantVibe} />
                  <MetricTile type="tables" value={dominantTables} />
                  <MetricTile type="outlets" value={dominantOutlets} />
                </div>

                <div className="pb-8">
                  <div className="text-heading-m text-text font-bold">
                    Notes &amp; Tips
                  </div>
                  {detail?.notes?.length ? (
                    <div className="mt-8 space-y-8">
                      {detail.notes.map((note) => (
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
              </>
            ) : null}
          </div>
        </div>
      </div>

      {photoPortalTarget && photoViewerOpen && photoUrls.length > 0
        ? createPortal(
            <div
              className="pointer-events-auto fixed inset-0 z-60 modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Place photos"
            >
              <Button
                variant="secondaryIcon"
                onClick={() => setPhotoViewerOpen(false)}
                aria-label="Close photo viewer"
                className="absolute right-16 top-[max(12px,env(safe-area-inset-top,0px))] z-10 shadow-map"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </Button>
              <div
                ref={photoViewerStripRef}
                onScroll={onPhotoViewerStripScroll}
                className="flex h-[100dvh] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide [-webkit-overflow-scrolling:touch]"
              >
                {photoUrls.map((src, idx) => (
                  <div
                    key={`viewer-${src}-${idx}`}
                    className="flex h-[100dvh] w-full min-w-full shrink-0 snap-start touch-pan-x items-center justify-center px-16"
                    onPointerDown={onPhotoSlidePointerDown}
                    onPointerMove={onPhotoSlidePointerMove}
                    onPointerUp={onPhotoSlidePointerEnd}
                    onPointerCancel={onPhotoSlidePointerEnd}
                  >
                    <img
                      src={src}
                      alt=""
                      className="max-h-full max-w-full rounded-radius-sm object-contain"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>,
            photoPortalTarget,
          )
        : null}

      <PlaceDetailCta
        className={!renderMap ? "pointer-events-auto" : ""}
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
  );
}
