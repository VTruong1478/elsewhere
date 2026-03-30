"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FeedItem } from "@/types/feed";
import { isValidGooglePlacesPhotoRef } from "@/lib/googlePlacePhoto";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";
import { Button } from "@/components/ui/Button";
import { MatchRing } from "@/components/ui/MatchRing";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  buildRateHref,
  capturePlaceSaved,
  feedItemHasPhotos,
} from "@/lib/analytics";
import { ensureAuthForGatedAction } from "@/lib/authGate";
import { tryCaptureGatedActionCompleted } from "@/lib/gatedAction";

type StatusKind = "open" | "closing-soon" | "closed";

function getOpenStatus(
  open_now: boolean,
  closes_at: string | null,
  closing_soon: boolean,
  open_late: boolean,
): { status: StatusKind; label: string } | null {
  if (closing_soon && closes_at) {
    return { status: "closing-soon", label: `Closing soon (${closes_at})` };
  }
  if (open_now && closes_at) {
    return { status: "open", label: `Open until ${closes_at}` };
  }
  if (!open_now) {
    return { status: "closed", label: "Closed" };
  }
  if (open_late && open_now) {
    return { status: "open", label: "Open" };
  }
  return null;
}

export function MapPlacePreview({ place }: { place: FeedItem }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rateHref = buildRateHref(place.id, place.name, "map");
  const returnPathForSave =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/map";
  const isRated = !!place.user_has_rated;
  const [isSaved, setIsSaved] = useState(!!place.is_favorited);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSaved(!!place.is_favorited);
  }, [place.is_favorited]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/saved", {
        method: "POST",
        credentials: "same-origin",
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
    onSuccess: () => {
      tryCaptureGatedActionCompleted({
        action_type: "save_place",
        place_id: place.id,
      });
      capturePlaceSaved(place, "map");
    },
    onError: () => setIsSaved(false),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/saved/${place.id}`, {
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
            const vibePath = place.vibe_photo_ref?.trim();
            if (vibePath) {
              if (isValidGooglePlacesPhotoRef(vibePath)) {
                return (
                  <img
                    src={`/api/place-photo?ref=${encodeURIComponent(vibePath)}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                );
              }
              const objectPath = vibePath.startsWith("user-photos/")
                ? vibePath.slice("user-photos/".length)
                : vibePath;
              return (
                <img
                  src={userPhotoProxyUrl(objectPath)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              );
            }
            const googleRef = place.google_photo_ref?.trim();
            return googleRef ? (
              <img
                src={`/api/places/${place.id}/photo`}
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
          <a
            href={rateHref}
            className="inline-flex"
            onClick={(e) => {
              e.preventDefault();
              void (async () => {
                if (
                  !(await ensureAuthForGatedAction(router.push, {
                    action_type: "rate_place",
                    source: "map",
                    place_id: place.id,
                    place_name: place.name,
                    place_type: place.place_type ?? undefined,
                    has_photos: feedItemHasPhotos(place),
                    returnPath: rateHref,
                  }))
                ) {
                  return;
                }
                router.push(rateHref);
              })();
            }}
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
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              void (async () => {
                if (isSaved) {
                  unsaveMutation.mutate();
                  return;
                }
                if (
                  !(await ensureAuthForGatedAction(router.push, {
                    action_type: "save_place",
                    source: "map",
                    place_id: place.id,
                    place_name: place.name,
                    place_type: place.place_type ?? undefined,
                    has_photos: feedItemHasPhotos(place),
                    returnPath: returnPathForSave,
                  }))
                ) {
                  return;
                }
                saveMutation.mutate();
              })();
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
