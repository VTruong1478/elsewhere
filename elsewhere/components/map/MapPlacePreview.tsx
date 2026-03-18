"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bookmark, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedItem } from "@/types/feed";
import { Button } from "@/components/ui/Button";
import { MatchRing } from "@/components/ui/MatchRing";
import { StatusDot } from "@/components/ui/StatusDot";

type StatusKind = "open" | "closing-soon" | "closed";

function getOpenStatus(
  open_now: boolean,
  closes_at: string | null,
  closing_soon: boolean,
  open_late: boolean,
): { status: StatusKind; label: string } | null {
  if (open_late && open_now) {
    return { status: "open", label: "Open late" };
  }
  if (closing_soon && closes_at) {
    return { status: "closing-soon", label: `Closing soon (${closes_at})` };
  }
  if (open_now && closes_at) {
    return { status: "open", label: `Open until ${closes_at}` };
  }
  if (!open_now) {
    return { status: "closed", label: "Closed" };
  }
  return null;
}

export function MapPlacePreview({ place }: { place: FeedItem }) {
  const queryClient = useQueryClient();
  const ratedQuery = useQuery<string[]>({
    queryKey: ["rated-places"],
    queryFn: async () => [],
    staleTime: Infinity,
    initialData: [],
  });
  const ratedPlaces = ratedQuery.data ?? [];
  const isRated = ratedPlaces.includes(place.id);
  const [isSaved, setIsSaved] = useState(!!place.is_favorited);

  useEffect(() => {
    setIsSaved(!!place.is_favorited);
  }, [place.is_favorited]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: place.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to save place",
        );
      }
    },
    onMutate: () => setIsSaved(true),
    onError: () => setIsSaved(false),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/saved/${place.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to unsave place",
        );
      }
    },
    onMutate: () => setIsSaved(false),
    onError: () => setIsSaved(true),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const distanceLabel =
    place.distance_mi != null
      ? `${place.distance_mi.toFixed(1)} mi`
      : place.neighborhood ?? place.address;
  const matchPercent = place.match_score_percent ?? 0;
  const openStatus = getOpenStatus(
    place.open_now,
    place.closes_at,
    place.closing_soon,
    place.open_late,
  );
  const noiseVibe = [place.noise, place.vibe]
    .filter(Boolean)
    .join(" · ") || "—";

  return (
    <div className="flex gap-16 overflow-hidden rounded-radius-md border border-surface-alt bg-surface shadow-map">
      <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-l-radius-md bg-surface-alt">
        {place.image_url ? (
          <img
            src={place.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          (() => {
            const ref =
              place.vibe_photo_ref?.trim() ?? place.google_photo_ref?.trim();
            return ref ? (
              <img
                src={`/api/place-photo?ref=${encodeURIComponent(ref)}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-surface-alt" />
            );
          })()
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-12 pr-16">
        <div>
          <h3 className="truncate text-heading-s text-text">{place.name}</h3>
          <p className="text-body-s text-text-secondary">{distanceLabel}</p>
        </div>
        <div className="flex items-center gap-8">
          <MatchRing score={matchPercent} />
          <span className="text-body-s text-text-secondary">{noiseVibe}</span>
        </div>
        {openStatus && (
          <div className="mt-4">
            <StatusDot
              status={openStatus.status}
              label={openStatus.label}
            />
          </div>
        )}
        <div className="mt-8 flex gap-8">
          <Link
            href={`/places/${place.id}/rate?name=${encodeURIComponent(
              place.name,
            )}`}
            className="inline-flex"
          >
            <Button
              variant="primary"
              type="button"
              className={isRated ? "bg-status-high text-text-inverse" : ""}
            >
              {isRated ? (
                <span className="flex items-center gap-8">
                  <Check size={16} aria-hidden />
                  <span>Rated</span>
                </span>
              ) : (
                "Rate"
              )}
            </Button>
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (isSaved) unsaveMutation.mutate();
              else saveMutation.mutate();
            }}
            disabled={saveMutation.isPending || unsaveMutation.isPending}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-radius-sm border border-surface-alt bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            aria-label={isSaved ? "Unsave place" : "Save place"}
          >
            <Bookmark
              size={20}
              fill={isSaved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
