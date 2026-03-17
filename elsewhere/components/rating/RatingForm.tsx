"use client";

import { useState } from "react";
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

  const mutation = useMutation({
    mutationFn: (payload: RatingPayload) => submitRating(placeId, payload),
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

    mutation.mutate(payload);
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
      {/* Photo upload area (UI only for now) */}
      <section className="space-y-8 rounded-radius-md bg-surface-alt p-16">
        <div className="flex items-center gap-8">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-surface">
            <Camera className="text-text-secondary" size={20} aria-hidden />
          </div>
          <div>
            <p className="text-ui-label-l text-text">Show us the vibe</p>
            <p className="text-body-s text-text-secondary">
              Upload a photo of the seating or workspace.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="mt-8 flex h-[120px] w-full items-center justify-center rounded-radius-md border border-dashed border-surface-alt bg-surface text-body-m text-text-secondary"
        >
          Tap to add a photo
        </button>
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

      {/* Overall rating */}
      <section className="space-y-8">
        <p className="text-ui-label-l text-text">
          Overall rating <span className="text-status-low">*</span>
        </p>
        <div className="flex items-center gap-8">
          {[0, 1, 2, 3, 4].map((i) => {
            const fill = getStarFill(overallRating ?? 0, i);
            const baseValue = i + 1;

            return (
              <div key={i} className="flex items-center">
                {/* half-star (left) */}
                <button
                  type="button"
                  onClick={() => setOverallRating(baseValue - 0.5)}
                  className="flex h-32 w-16 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`${baseValue - 0.5} stars`}
                >
                  {fill === "half" || (overallRating ?? 0) < baseValue ? (
                    <StarHalf
                      size={24}
                      className={
                        (overallRating ?? 0) >= baseValue - 0.5
                          ? "text-accent"
                          : "text-surface-alt"
                      }
                    />
                  ) : (
                    <Star
                      size={24}
                      className={
                        (overallRating ?? 0) >= baseValue - 0.5
                          ? "text-accent"
                          : "text-surface-alt"
                      }
                    />
                  )}
                </button>
                {/* full-star (right) */}
                <button
                  type="button"
                  onClick={() => setOverallRating(baseValue)}
                  className="flex h-32 w-16 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`${baseValue} stars`}
                >
                  <Star
                    size={24}
                    className={
                      (overallRating ?? 0) >= baseValue
                        ? "text-accent"
                        : "text-surface-alt"
                    }
                  />
                </button>
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

