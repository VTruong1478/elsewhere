"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Volume2,
  Headphones,
  Plug,
  Table as TableIcon,
  Star,
  StarHalf,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TextArea } from "@/components/ui/TextArea";

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

function getStarFill(overall: number, index: number): "full" | "half" | "empty" {
  const starValue = index + 1;
  if (overall >= starValue) return "full";
  if (overall >= starValue - 0.5) return "half";
  return "empty";
}

const STAR_GAP_PX = 4; // gap-4 in this project's Tailwind (spacing 4 = 4px)

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
  const posInStar = Math.max(0, Math.min(1, (relX - starIndex * segment) / starWidth));
  const isLeftHalf = posInStar < 0.55; // Slightly favor half-star to make it easier to select
  setRating(isLeftHalf ? starIndex + 0.5 : starIndex + 1);
}

export function RatingForm({
  placeId,
  placeName,
}: {
  placeId: string;
  placeName: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [noise, setNoise] = useState<NoiseValue | null>(null);
  const [vibe, setVibe] = useState<VibeValue | null>(null);
  const [tables, setTables] = useState<TablesValue | null>(null);
  const [outlets, setOutlets] = useState<OutletsValue | null>(null);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const uploadRes = await fetch(
          `/api/places/${placeId}/upload-photo`,
          { method: "POST", body: formData },
        );
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
      }
    },
    onSuccess: () => {
      queryClient.setQueryData<string[] | undefined>(
        ["rated-places"],
        (prev) => {
          const base = prev ?? [];
          if (base.includes(placeId)) return base;
          return [...base, placeId];
        },
      );
      router.push("/feed");
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
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
    e.target.value = "";
  }

  function clearPhoto() {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete || mutation.isPending || overallRating == null) return;

    const payload: RatingPayload = {
      noise: noise!,
      vibe: vibe!,
      tables: tables!,
      outlets: outlets!,
      overall_rating: overallRating,
      notes: notes.trim() ? notes.trim() : null,
      photo_path: null,
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
  }: {
    label: string;
    required?: boolean;
    icon: React.ReactNode;
    options: readonly T[];
    value: T | null;
    onChange: (v: T) => void;
  }) {
    return (
      <section className="space-y-8">
        <div className="flex items-center gap-8">
          <span className="text-text-secondary">{icon}</span>
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
                onClick={() => onChange(opt)}
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
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-24 rounded-radius-md bg-surface p-16"
    >
      {/* Photo upload */}
      <section className="space-y-8 rounded-radius-md bg-surface-alt p-16">
        <div className="flex items-center gap-8">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-surface">
            <Camera className="text-text-secondary" size={20} aria-hidden />
          </div>
          <div>
            <p className="text-ui-label-l text-text">Show us the vibe</p>
            <p className="text-body-s text-text-secondary">
              Upload a photo of the seating or workspace (JPEG or WebP, max 5MB).
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handlePhotoChange}
        />
        {photoPreview ? (
          <div className="relative">
            <img
              src={photoPreview}
              alt="Preview"
              className="h-[160px] w-full rounded-radius-md object-cover"
            />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute right-8 top-8 flex h-24 w-24 items-center justify-center rounded-full bg-surface/90 text-text"
              aria-label="Remove photo"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-8 flex h-[120px] w-full items-center justify-center rounded-radius-md border border-dashed border-surface-alt bg-surface text-body-m text-text-secondary"
          >
            Tap to add a photo
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
      })}

      {renderOptionRow<VibeValue>({
        label: "Vibes",
        required: true,
        icon: <Headphones size={20} />,
        options: VIBE_OPTIONS,
        value: vibe,
        onChange: setVibe,
      })}

      {renderOptionRow<TablesValue>({
        label: "Tables",
        required: true,
        icon: <TableIcon size={20} />,
        options: TABLES_OPTIONS,
        value: tables,
        onChange: setTables,
      })}

      {renderOptionRow<OutletsValue>({
        label: "Outlets",
        required: true,
        icon: <Plug size={20} />,
        options: OUTLETS_OPTIONS,
        value: outlets,
        onChange: setOutlets,
      })}

      {/* Overall rating — 5 stars with half-star support (hover/drag to select) */}
      <section className="space-y-8">
        <p className="text-ui-label-l text-text">
          Overall rating <span className="text-status-low">*</span>
        </p>
        <div
          className="flex items-center gap-4"
          role="slider"
          aria-label="Overall rating, drag to select half stars"
          aria-valuemin={0.5}
          aria-valuemax={5}
          aria-valuenow={overallRating ?? 0}
          onPointerMove={(e) => {
            // Only update when clicking/dragging, not on hover. e.buttons is 0 for touch, so also check pointer capture.
            if (e.buttons === 0 && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            updateRatingFromPosition(e.clientX, rect, setOverallRating);
          }}
          onPointerDown={(e) => {
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
                className="relative flex h-28 flex-1 shrink-0 cursor-pointer"
              >
                <span className="pointer-events-none flex h-full w-full items-center justify-center">
                  {fill === "full" ? (
                    <Star size={28} className="text-accent" />
                  ) : fill === "half" ? (
                    <StarHalf size={28} className="text-accent" />
                  ) : (
                    <Star size={28} className="text-surface-alt" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-8">
        <div className="flex items-center gap-8">
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
        className="w-full"
      >
        {mutation.isPending ? "Submitting..." : `Submit rating for ${placeName}`}
      </Button>
    </form>
  );
}

