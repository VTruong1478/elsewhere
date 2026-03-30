"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Headphones,
  Pencil,
  Plug,
  Table as TableIcon,
  Star,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TextArea } from "@/components/ui/TextArea";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";
import { normalizePlaceId } from "@/lib/placeId";
import { fetchPlaceDetail, placeDetailQueryKey } from "@/lib/placeDetailQuery";
import { captureEvent } from "@/lib/analytics";
import { tryCaptureGatedActionCompleted } from "@/lib/gatedAction";

const NOISE_OPTIONS = ["silent", "quiet", "vibrant"] as const;
const VIBE_OPTIONS = ["focused", "casual", "social"] as const;
const TABLES_OPTIONS = ["limited", "mixed", "plentiful"] as const;
const OUTLETS_OPTIONS = ["scarce", "some", "ample"] as const;

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
};

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? "Failed to submit rating",
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
}: {
  placeId: string;
  placeName: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const normalizedPlaceId = useMemo(() => normalizePlaceId(placeId), [placeId]);
  const ratingStartedSentRef = useRef(false);
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  /** Local preview URL for a newly selected file only (revoked on clear). */
  const [localPhotoBlobUrl, setLocalPhotoBlobUrl] = useState<string | null>(
    null,
  );
  /** Server photo path from `my_rating` — kept for POST so upsert does not clear photo before upload/PATCH. */
  const [initialPhotoPathFromServer, setInitialPhotoPathFromServer] = useState<
    string | null
  >(null);
  const [photoRemovedByUser, setPhotoRemovedByUser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFromDetailRef = useRef(false);

  const serverPhotoPublicUrl = useMemo(() => {
    if (!initialPhotoPathFromServer?.trim()) return null;
    return userPhotoProxyUrl(initialPhotoPathFromServer);
  }, [initialPhotoPathFromServer]);

  const displayPhotoUrl =
    photoFile && localPhotoBlobUrl
      ? localPhotoBlobUrl
      : !photoRemovedByUser && serverPhotoPublicUrl
        ? serverPhotoPublicUrl
        : null;

  useEffect(() => {
    if (!detail || hydratedFromDetailRef.current) return;
    const m = detail.my_rating;
    if (!m) {
      hydratedFromDetailRef.current = true;
      return;
    }
    if (isNoiseValue(m.noise)) setNoise(m.noise);
    if (isVibeValue(m.vibe)) setVibe(m.vibe);
    if (isTablesValue(m.tables)) setTables(m.tables);
    if (isOutletsValue(m.outlets)) setOutlets(m.outlets);
    const o = Number(m.overall_rating);
    if (Number.isFinite(o) && o >= 0 && o <= 5) setOverallRating(o);
    if (m.notes != null) {
      setNotes(String(m.notes));
    }
    const path = m.photo_path?.trim();
    setInitialPhotoPathFromServer(path && path.length > 0 ? path : null);
    hydratedFromDetailRef.current = true;
  }, [detail]);

  useEffect(() => {
    const url = localPhotoBlobUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [localPhotoBlobUrl]);

  const isEditMode = Boolean(detailFetched && detail?.my_rating);

  function ratingHasPhotosNow(): boolean {
    if (photoFile) return true;
    if (initialPhotoPathFromServer && !photoRemovedByUser) return true;
    return false;
  }

  function ensureRatingStarted() {
    if (ratingStartedSentRef.current) return;
    ratingStartedSentRef.current = true;
    captureEvent("rating_started", {
      place_id: normalizedPlaceId ?? placeId,
      place_name: _placeName,
      place_type: detail?.place?.place_type,
      has_photos: ratingHasPhotosNow(),
    });
  }

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      photo,
    }: {
      payload: RatingPayload;
      photo: File | null;
    }) => {
      await submitRating(placeId, payload);
      if (photo) {
        const formData = new FormData();
        formData.append("photo", photo);
        const uploadRes = await fetch(`/api/places/${placeId}/upload-photo`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const json = await uploadRes.json().catch(() => ({}));
          throw new Error(
            (json as { error?: string }).error ?? "Photo upload failed",
          );
        }
        const { path } = (await uploadRes.json()) as { path: string };
        const patchRes = await fetch(`/api/places/${placeId}/rate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo_path: path }),
        });
        if (!patchRes.ok) {
          throw new Error("Failed to save photo to rating");
        }
        captureEvent("photo_uploaded", {
          place_id: placeId,
          place_name: _placeName,
          place_type: detail?.place?.place_type,
          has_photos: true,
        });
        tryCaptureGatedActionCompleted({
          action_type: "upload_photo",
          place_id: normalizedPlaceId ?? placeId,
        });
      }
    },
    onSuccess: (_data, variables) => {
      const hadPhoto =
        variables.photo != null ||
        (variables.payload.photo_path != null &&
          String(variables.payload.photo_path).trim() !== "");
      captureEvent("rating_submitted", {
        place_id: normalizedPlaceId ?? placeId,
        place_name: _placeName,
        place_type: detail?.place?.place_type,
        has_photos: hadPhoto,
      });
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
      }
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/feed");
      }
    },
  });

  const isComplete =
    noise != null &&
    vibe != null &&
    tables != null &&
    outlets != null &&
    overallRating != null;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        return;
      }
      ensureRatingStarted();
      setPhotoRemovedByUser(false);
      setPhotoFile(file);
      setLocalPhotoBlobUrl(URL.createObjectURL(file));
    }
    e.target.value = "";
  }

  function clearPhoto() {
    if (photoFile) {
      setPhotoFile(null);
      setLocalPhotoBlobUrl(null);
      return;
    }
    if (initialPhotoPathFromServer && !photoRemovedByUser) {
      setPhotoRemovedByUser(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete || mutation.isPending || overallRating == null) return;

    let photo_path: string | null = null;
    if (photoRemovedByUser && !photoFile) {
      photo_path = null;
    } else if (photoFile) {
      photo_path = initialPhotoPathFromServer;
    } else {
      photo_path = initialPhotoPathFromServer ?? null;
    }

    const payload: RatingPayload = {
      noise: noise!,
      vibe: vibe!,
      tables: tables!,
      outlets: outlets!,
      overall_rating: overallRating,
      notes: notes.trim() ? notes.trim() : null,
      photo_path,
    };

    mutation.mutate({ payload, photo: photoFile });
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
    <form onSubmit={handleSubmit} className="space-y-24 pb-32">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Photo upload — dashed frame, camera in circle, copy per Figma */}
      <section>
        {displayPhotoUrl ? (
          <div className="relative overflow-hidden rounded-radius-md border-2 border-dashed border-text-secondary bg-surface p-16">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Replace photo"
            >
              <img
                src={displayPhotoUrl}
                alt=""
                className="h-[160px] w-full rounded-radius-sm object-cover"
              />
            </button>
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute right-12 top-12 z-10 flex h-32 w-32 items-center justify-center rounded-full bg-surface text-text shadow-map"
              aria-label={photoFile ? "Remove new photo" : "Remove photo"}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center rounded-radius-md border-2 border-dashed border-text-secondary bg-surface px-24 py-32 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-surface-chip">
              <Camera className="text-primary" size={24} aria-hidden />
            </div>
            <p className="mt-8 text-ui-label-xl text-text">Show us the vibe</p>
            <p className="max-w-xs text-body-s text-text-secondary">
              Upload a photo of the seating or workspace.
            </p>
          </button>
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
        icon: <TableIcon size={20} />,
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
        <p className="text-ui-label-l text-text">
          Overall rating <span className="text-status-low">*</span>
        </p>
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
    </form>
  );
}
