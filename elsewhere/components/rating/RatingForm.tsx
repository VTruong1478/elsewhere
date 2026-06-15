"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Headphones,
  Pencil,
  Plug,
  Star,
  Volume2,
  X,
} from "lucide-react";
import { PiPicnicTableBold } from "react-icons/pi";
import { Button } from "@/components/ui/Button";
import { MapLoadingOverlay } from "@/components/map/MapLoadingOverlay";
import { Pill } from "@/components/ui/Pill";
import { TextArea } from "@/components/ui/TextArea";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";
import { normalizePlaceId } from "@/lib/placeId";
import {
  PHOTO_FILE_ACCEPT,
  PHOTO_MAX_SIZE_BYTES,
  normalizePhotoForUpload,
} from "@/lib/photoUpload";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import {
  type AnalyticsSource,
  captureRatingFunnelEvent,
} from "@/lib/analytics";
import { tryCaptureGatedActionCompleted } from "@/lib/gatedAction";

const NOISE_OPTIONS = ["silent", "quiet", "vibrant"] as const;
const VIBE_OPTIONS = ["focused", "casual", "social"] as const;
const TABLES_OPTIONS = ["limited", "mixed", "plentiful"] as const;
const OUTLETS_OPTIONS = ["scarce", "some", "ample"] as const;

/** Matches /api/places/[id]/rate MAX_RATING_PHOTOS */
const MAX_RATING_PHOTOS = 6;

type NoiseValue = (typeof NOISE_OPTIONS)[number];
type VibeValue = (typeof VIBE_OPTIONS)[number];
type TablesValue = (typeof TABLES_OPTIONS)[number];
type OutletsValue = (typeof OUTLETS_OPTIONS)[number];

type RatingPayload = {
  noise: NoiseValue;
  vibe: VibeValue;
  tables: TablesValue;
  outlets: OutletsValue;
  overall_rating: number;
  notes?: string | null;
  photo_path?: string | null;
  photo_paths?: string[];
};

class RatingSubmitError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isNoiseValue(v: string): v is NoiseValue {
  return (NOISE_OPTIONS as readonly string[]).includes(v);
}
function isVibeValue(v: string): v is VibeValue {
  return (VIBE_OPTIONS as readonly string[]).includes(v);
}
function isTablesValue(v: string): v is TablesValue {
  return (TABLES_OPTIONS as readonly string[]).includes(v);
}
function isOutletsValue(v: string): v is OutletsValue {
  return (OUTLETS_OPTIONS as readonly string[]).includes(v);
}

async function submitRating(placeId: string, payload: RatingPayload) {
  const res = await fetch(`/api/places/${placeId}/rate`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new RatingSubmitError(
      (json as { error?: string }).error ?? "Failed to submit rating",
      res.status,
    );
  }

  return json;
}

function getStarFill(
  overall: number,
  index: number,
): "full" | "half" | "empty" {
  const starValue = index + 1;
  if (overall >= starValue) return "full";
  if (overall >= starValue - 0.5) return "half";
  return "empty";
}

const STAR_GAP_PX = 4; // gap-4 in this project's Tailwind (spacing 4 = 4px)
const STAR_PX = 28;

/** Half star: clipped full star (straight vertical bisect) — avoids Lucide StarHalf rounded “cut”. */
function HalfStarIcon() {
  return (
    <div
      className="relative shrink-0"
      style={{ width: STAR_PX, height: STAR_PX }}
    >
      <Star
        size={STAR_PX}
        className="absolute left-0 top-0 text-secondary"
        strokeWidth={1.75}
        fill="none"
      />
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: STAR_PX / 2 }}
        aria-hidden
      >
        <Star
          size={STAR_PX}
          className="absolute left-0 top-0 fill-primary text-primary"
        />
      </div>
    </div>
  );
}

function updateRatingFromPosition(
  clientX: number,
  rect: DOMRect,
  setRating: (v: number) => void,
) {
  const relX = clientX - rect.left;
  if (relX < 0 || relX > rect.width) return;
  // Account for gaps: 5 stars + 4 gaps. Each star width = (total - 4*gap) / 5
  const starWidth = (rect.width - 4 * STAR_GAP_PX) / 5;
  const segment = starWidth + STAR_GAP_PX; // one star + its right gap
  const starIndex = Math.min(4, Math.max(0, Math.floor(relX / segment)));
  const posInStar = Math.max(
    0,
    Math.min(1, (relX - starIndex * segment) / starWidth),
  );
  const isLeftHalf = posInStar < 0.55; // Slightly favor half-star to make it easier to select
  setRating(isLeftHalf ? starIndex + 0.5 : starIndex + 1);
}

export function RatingForm({
  placeId,
  placeName: _placeName,
  source,
  returnTo,
}: {
  placeId: string;
  placeName: string;
  /** Entry surface for the rating flow (from `?source=`); locked on first render for funnel events. */
  source: AnalyticsSource;
  /** Optional safe relative path to return to after successful submit. */
  returnTo?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const normalizedPlaceId = useMemo(() => normalizePlaceId(placeId), [placeId]);
  const [ratingFlowSource] = useState<AnalyticsSource>(() => source);
  const [ratingStartedSent, setRatingStartedSent] = useState(false);
  const { data: detail, isFetched: detailFetched } = useQuery({
    queryKey: placeDetailQueryKey(normalizedPlaceId ?? "__invalid__"),
    queryFn: () => fetchPlaceDetail(normalizedPlaceId!),
    enabled: !!normalizedPlaceId,
    staleTime: 5 * 60 * 1000,
  });

  const [noise, setNoise] = useState<NoiseValue | null>(null);
  const [vibe, setVibe] = useState<VibeValue | null>(null);
  const [tables, setTables] = useState<TablesValue | null>(null);
  const [outlets, setOutlets] = useState<OutletsValue | null>(null);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  /** Storage paths already saved for this rating (subset user keeps). */
  const [serverPaths, setServerPaths] = useState<string[]>([]);
  /** New files to upload after POST (with blob URLs for preview). */
  const [localPhotos, setLocalPhotos] = useState<{ file: File; url: string }[]>(
    [],
  );
  const [photoSelectionError, setPhotoSelectionError] = useState<string | null>(
    null,
  );
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const hydratedFromDetailRef = useRef(false);
  const localPhotosRef = useRef<{ file: File; url: string }[]>([]);

  useEffect(() => {
    localPhotosRef.current = localPhotos;
  }, [localPhotos]);

  useEffect(() => {
    if (!detail || hydratedFromDetailRef.current) return;
    const m = detail.my_rating;
    if (!m) {
      hydratedFromDetailRef.current = true;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate once from server response
    if (isNoiseValue(m.noise)) setNoise(m.noise);
    if (isVibeValue(m.vibe)) setVibe(m.vibe);
    if (isTablesValue(m.tables)) setTables(m.tables);
    if (isOutletsValue(m.outlets)) setOutlets(m.outlets);
    const o = Number(m.overall_rating);
    if (Number.isFinite(o) && o >= 0 && o <= 5) setOverallRating(o);
    if (m.notes != null) {
      setNotes(String(m.notes));
    }
    const fromApi =
      Array.isArray(m.photo_paths) && m.photo_paths.length > 0
        ? m.photo_paths.map((p) => String(p).trim()).filter(Boolean)
        : m.photo_path?.trim()
          ? [m.photo_path.trim()]
          : [];
    setServerPaths(fromApi);
    setLocalPhotos([]);
    hydratedFromDetailRef.current = true;
  }, [detail]);

  useEffect(() => {
    return () => {
      localPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  const isEditMode = Boolean(detailFetched && detail?.my_rating);

  function ratingHasPhotosNow(): boolean {
    return serverPaths.length > 0 || localPhotos.length > 0;
  }

  function ratingFunnelPlaceSnapshot(hasPhotos: boolean): {
    id: string;
    name: string;
    place_type: string;
    has_photos: boolean;
  } {
    return {
      id: normalizedPlaceId ?? placeId,
      name: _placeName,
      place_type: detail?.place?.place_type?.trim() ?? "",
      has_photos: hasPhotos,
    };
  }

  function ensureRatingStarted() {
    if (ratingStartedSent) return;
    setRatingStartedSent(true);
    captureRatingFunnelEvent(
      "rating_started",
      ratingFunnelPlaceSnapshot(ratingHasPhotosNow()),
      ratingFlowSource,
    );
  }

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      newFiles,
    }: {
      payload: RatingPayload;
      newFiles: File[];
    }) => {
      await submitRating(placeId, payload);
      if (newFiles.length === 0) return;
      setIsUploadingPhotos(true);
      const paths = [...(payload.photo_paths ?? [])];
      try {
        for (const file of newFiles) {
          const formData = new FormData();
          formData.append("photo", file);
          const uploadRes = await fetch(`/api/places/${placeId}/upload-photo`, {
            method: "POST",
            credentials: "same-origin",
            body: formData,
          });
          if (!uploadRes.ok) {
            const json = await uploadRes
              .json()
              .catch(() => ({}) as { error?: string; message?: string });
            const apiMessage =
              typeof json.error === "string"
                ? json.error
                : typeof json.message === "string"
                  ? json.message
                  : null;
            if (uploadRes.status === 413) {
              throw new Error("Photo is too large. Please use an image under 4MB.");
            }
            throw new Error(
              apiMessage ??
                `Photo upload failed (${uploadRes.status}). Please try a smaller image.`,
            );
          }
          const { path } = (await uploadRes.json()) as { path: string };
          paths.push(path);
        }
        const patchRes = await fetch(`/api/places/${placeId}/rate`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo_paths: paths }),
        });
        if (!patchRes.ok) {
          throw new Error("Failed to save photos to rating");
        }
      } finally {
        setIsUploadingPhotos(false);
      }
      captureRatingFunnelEvent(
        "photo_uploaded",
        ratingFunnelPlaceSnapshot(true),
        ratingFlowSource,
      );
      tryCaptureGatedActionCompleted({
        action_type: "upload_photo",
        place_id: normalizedPlaceId ?? placeId,
      });
    },
    onSuccess: (_data, variables) => {
      const hadPhoto =
        variables.newFiles.length > 0 ||
        (variables.payload.photo_paths != null &&
          variables.payload.photo_paths.length > 0);
      captureRatingFunnelEvent(
        "rating_submitted",
        ratingFunnelPlaceSnapshot(hadPhoto),
        ratingFlowSource,
      );
      tryCaptureGatedActionCompleted({
        action_type: "rate_place",
        place_id: normalizedPlaceId ?? placeId,
      });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      if (normalizedPlaceId) {
        queryClient.invalidateQueries({
          queryKey: placeDetailQueryKey(normalizedPlaceId),
        });
        queryClient.invalidateQueries({
          queryKey: ["place-user-photos", normalizedPlaceId],
        });
      }
      if (returnTo) {
        const currentPath =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "";
        const isPlaceDetailReturn = /^\/places\/[^/]+$/.test(returnTo);
        const returnToWithBackTarget = isPlaceDetailReturn
          ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}back_to=feed`
          : returnTo;
        // If return target is the same detail URL, go back instead of push so we
        // don't duplicate /places/[id] in history (which breaks the next Back tap).
        if (
          typeof window !== "undefined" &&
          window.history.length > 1 &&
          currentPath === returnTo
        ) {
          router.back();
        } else {
          router.push(returnToWithBackTarget);
        }
      } else if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/feed");
      }
    },
    onError: (error) => {
      const status =
        error instanceof RatingSubmitError ? error.status : undefined;
      if (status === 401 && typeof window !== "undefined") {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        router.push(`/signup?next=${encodeURIComponent(nextPath)}`);
      }
    },
  });

  const isComplete =
    noise != null &&
    vibe != null &&
    tables != null &&
    outlets != null &&
    overallRating != null;

  const photoCount = serverPaths.length + localPhotos.length;
  const canAddMorePhotos = photoCount < MAX_RATING_PHOTOS;

  async function addPhotoFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setPhotoSelectionError(null);
    const remaining =
      MAX_RATING_PHOTOS - serverPaths.length - localPhotos.length;
    if (remaining <= 0) return;
    ensureRatingStarted();
    const accepted: { file: File; url: string }[] = [];
    const errors: string[] = [];
    for (const file of Array.from(fileList)) {
      if (accepted.length >= remaining) break;
      let normalized: File;
      try {
        normalized = await normalizePhotoForUpload(file);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unsupported file type.";
        errors.push(`${file.name}: ${msg}`);
        continue;
      }

      if (normalized.size > PHOTO_MAX_SIZE_BYTES) {
        errors.push(`${file.name}: Photo must be under 4MB.`);
        continue;
      }

      accepted.push({ file: normalized, url: URL.createObjectURL(normalized) });
    }
    if (accepted.length > 0) {
      setLocalPhotos((prev) => [...prev, ...accepted]);
    }
    if (errors.length > 0) {
      setPhotoSelectionError(errors.join(" "));
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    void addPhotoFiles(e.target.files);
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = canAddMorePhotos ? "copy" : "none";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (!canAddMorePhotos) return;
    void addPhotoFiles(e.dataTransfer.files);
  }

  function removeServerPath(index: number) {
    setServerPaths((prev) => prev.filter((_, i) => i !== index));
  }

  function removeLocalPhoto(index: number) {
    setLocalPhotos((prev) => {
      const row = prev[index];
      if (row) URL.revokeObjectURL(row.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete || mutation.isPending || overallRating == null) return;

    const pathsPayload = [...serverPaths];
    const payload: RatingPayload = {
      noise: noise!,
      vibe: vibe!,
      tables: tables!,
      outlets: outlets!,
      overall_rating: overallRating,
      notes: notes.trim() ? notes.trim() : null,
      photo_paths: pathsPayload,
      photo_path: pathsPayload[0] ?? null,
    };

    mutation.mutate({
      payload,
      newFiles: localPhotos.map((p) => p.file),
    });
  }

  function renderOptionRow<T extends string>({
    label,
    required,
    icon,
    options,
    value,
    onChange,
    onFirstInteraction,
  }: {
    label: string;
    required?: boolean;
    icon: React.ReactNode;
    options: readonly T[];
    value: T | null;
    onChange: (v: T) => void;
    onFirstInteraction?: () => void;
  }) {
    return (
      <section className="space-y-8">
        <div className="space-y-8">
          <div className="flex items-center gap-8">
            <span className="text-text">{icon}</span>
            <p className="text-ui-label-l text-text">
              {label}
              {required && <span className="text-status-low"> *</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            {options.map((opt) => {
              const isSelected = value === opt;
              const display =
                opt.charAt(0).toUpperCase() + opt.slice(1).replace("-", " ");
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onFirstInteraction?.();
                    onChange(opt);
                  }}
                  className="relative rounded-radius-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Pill
                    variant="placeType"
                    className={
                      isSelected ? "!bg-accent !text-text-inverse" : ""
                    }
                  >
                    {display}
                  </Pill>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="relative">
      {isUploadingPhotos ? <MapLoadingOverlay label="Uploading photos…" /> : null}
      <form
        onSubmit={handleSubmit}
        className="space-y-24 pb-[calc(120px+env(safe-area-inset-bottom,0px))] lg:pb-32"
      >
      <input
        ref={fileInputRef}
        type="file"
        accept={PHOTO_FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Photos — up to MAX_RATING_PHOTOS; multiple selection supported */}
      <section
        className="space-y-12"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {photoCount === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex w-full flex-col items-center rounded-radius-md border-2 border-dashed px-24 py-24 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isDragging
                ? "border-accent bg-surface-chip"
                : "border-text-secondary bg-surface"
            }`}
          >
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-surface-chip">
              <Camera className="text-primary" size={24} aria-hidden />
            </div>
            <p className="mt-8 text-ui-label-xl text-text">Show us the vibe</p>
            <p className="max-w-xs text-body-s text-text-secondary">
              {isDragging
                ? "Drop to upload"
                : "Upload photos of the seating or workspace."}
            </p>
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-8">
              {serverPaths.map((path, i) => (
                <div
                  key={`srv-${path}-${i}`}
                  className="relative h-[160px] w-[160px] shrink-0 overflow-hidden rounded-radius-md border border-surface-alt bg-surface-alt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={userPhotoProxyUrl(path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeServerPath(i)}
                    className="absolute right-4 top-4 z-10 flex h-32 w-32 items-center justify-center rounded-full bg-surface text-text shadow-map"
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {localPhotos.map((p, i) => (
                <div
                  key={p.url}
                  className="relative h-[160px] w-[160px] shrink-0 overflow-hidden rounded-radius-md border border-surface-alt bg-surface-alt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeLocalPhoto(i)}
                    className="absolute right-4 top-4 z-10 flex h-32 w-32 items-center justify-center rounded-full bg-surface text-text shadow-map"
                    aria-label="Remove new photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {canAddMorePhotos && !isDragging ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-[160px] w-[160px] shrink-0 flex-col items-center justify-center rounded-radius-md border-2 border-dashed border-text-secondary bg-surface px-8 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="Add more photos"
                >
                  <Camera className="text-primary" size={18} aria-hidden />
                  <p className="mt-4 text-ui-label-s text-text">
                    Add more photos
                  </p>
                </button>
              ) : null}
            </div>
            {isDragging && canAddMorePhotos ? (
              <div className="flex w-full items-center justify-center rounded-radius-md border-2 border-dashed border-accent bg-surface-chip py-16 text-center">
                <p className="text-ui-label-l text-accent">Drop photos here</p>
              </div>
            ) : null}
            {!canAddMorePhotos ? (
              <p className="text-body-s text-text-secondary text-center">
                Photo limit reached.
              </p>
            ) : null}
            {photoSelectionError && (
              <p className="text-body-s text-status-low text-center">
                {photoSelectionError}
              </p>
            )}
          </>
        )}
      </section>

      {renderOptionRow<NoiseValue>({
        label: "Noise level",
        required: true,
        icon: <Volume2 size={20} />,
        options: NOISE_OPTIONS,
        value: noise,
        onChange: setNoise,
        onFirstInteraction: ensureRatingStarted,
      })}

      {renderOptionRow<VibeValue>({
        label: "Vibes",
        required: true,
        icon: <Headphones size={20} />,
        options: VIBE_OPTIONS,
        value: vibe,
        onChange: setVibe,
        onFirstInteraction: ensureRatingStarted,
      })}

      {renderOptionRow<TablesValue>({
        label: "Tables",
        required: true,
        icon: <PiPicnicTableBold size={20} />,
        options: TABLES_OPTIONS,
        value: tables,
        onChange: setTables,
        onFirstInteraction: ensureRatingStarted,
      })}

      {renderOptionRow<OutletsValue>({
        label: "Outlets",
        required: true,
        icon: <Plug size={20} />,
        options: OUTLETS_OPTIONS,
        value: outlets,
        onChange: setOutlets,
        onFirstInteraction: ensureRatingStarted,
      })}

      {/* Overall rating — 5 stars with half-star support (hover/drag to select) */}
      <section className="space-y-16 text-center">
        <div className="space-y-0">
          <p className="text-ui-label-l text-text">
            Workability rating <span className="text-status-low">*</span>
          </p>
          <p className="text-body-s text-text-secondary">
            How good is this place for getting work done?
          </p>
        </div>
        <div
          className="flex items-center justify-center gap-4"
          role="slider"
          aria-label="Overall rating, drag to select half stars"
          aria-valuemin={0.5}
          aria-valuemax={5}
          aria-valuenow={overallRating ?? 0}
          onPointerMove={(e) => {
            // Only update when clicking/dragging, not on hover. e.buttons is 0 for touch, so also check pointer capture.
            if (
              e.buttons === 0 &&
              !e.currentTarget.hasPointerCapture(e.pointerId)
            )
              return;
            const rect = e.currentTarget.getBoundingClientRect();
            updateRatingFromPosition(e.clientX, rect, setOverallRating);
          }}
          onPointerDown={(e) => {
            ensureRatingStarted();
            e.currentTarget.setPointerCapture(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            updateRatingFromPosition(e.clientX, rect, setOverallRating);
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const fill = getStarFill(overallRating ?? 0, i);
            return (
              <div
                key={i}
                className="relative flex h-30 flex-1 shrink-0 cursor-pointer"
              >
                <span className="pointer-events-none flex h-full w-full items-center justify-center">
                  {fill === "full" ? (
                    <Star
                      size={STAR_PX}
                      className="fill-primary text-primary"
                    />
                  ) : fill === "half" ? (
                    <HalfStarIcon />
                  ) : (
                    <Star
                      size={STAR_PX}
                      className="text-secondary"
                      strokeWidth={1.75}
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notes — field uses same chrome as global Input (multiline variant) */}
      <section className="space-y-16">
        <div className="flex items-center gap-8">
          <Pencil className="text-text" size={20} aria-hidden />
          <span className="text-ui-label-l text-text">Add a tip</span>
        </div>
        <TextArea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Best seats are near the window. Outlets are along the wall."
        />
      </section>

      <Button
        variant="primary"
        type="submit"
        disabled={!isComplete || mutation.isPending}
        className="w-full rounded-full py-12"
      >
        {mutation.isPending
          ? "Submitting..."
          : isEditMode
            ? "Update Rating"
            : "Submit rating"}
      </Button>
      {mutation.isError && (
        <p className="text-body-s text-status-low">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Failed to submit rating"}
        </p>
      )}
      </form>
    </div>
  );
}
