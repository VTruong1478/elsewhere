"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedItem } from "@/types/feed";
import { usePlaceStore } from "@/store/usePlaceStore";
import { Button } from "@/components/ui/Button";
import { MatchRing } from "@/components/ui/MatchRing";
import { MetricTile } from "@/components/ui/MetricTile";
import { Pill } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { createClient } from "@/lib/supabase/client";

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

export function PlaceCard({ place }: { place: FeedItem }) {
  const { setSelectedPlaceId } = usePlaceStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileOrTablet(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const ratedQuery = useQuery<string[]>({
    queryKey: ["rated-places"],
    // No network fetch needed; this query is purely client-side cache.
    queryFn: async () => [],
    staleTime: Infinity,
    initialData: [],
  });
  const ratedPlaces = ratedQuery.data ?? [];
  const isRated = ratedPlaces.includes(place.id);
  const [isSaved, setIsSaved] = useState<boolean>(!!place.is_favorited);

  useEffect(() => {
    // Sync server-provided favorited state into the optimistic UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    onMutate: async () => {
      setIsSaved(true);
      queryClient.setQueryData<FeedItem[] | undefined>(
        ["saved-places"],
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          if (prev.some((p) => p.id === place.id)) return prev;
          return [{ ...place, is_favorited: true }, ...prev];
        },
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
      const res = await fetch(`/api/saved/${place.id}`, {
        method: "DELETE",
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
          Array.isArray(prev) ? prev.filter((p) => p.id !== place.id) : prev,
      );
    },
    onError: () => {
      setIsSaved(true);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

  const matchPercent = place.match_score_percent ?? 0;
  const distanceNeighborhood =
    place.distance_mi != null && place.neighborhood
      ? `${place.distance_mi.toFixed(1)} mi · ${place.neighborhood}`
      : place.neighborhood
        ? place.neighborhood
        : place.distance_mi != null
          ? `${place.distance_mi.toFixed(1)} mi`
          : place.address;
  const ratingLabel =
    place.rating_count != null ? `· ${place.rating_count} ratings` : undefined;
  const openStatus = getOpenStatus(
    place.open_now,
    place.closes_at,
    place.closing_soon,
    place.open_late,
  );

  return (
    <article
      data-place-id={place.id}
      role="button"
      tabIndex={0}
      onClick={() => {
        setSelectedPlaceId(place.id);
        if (isMobileOrTablet) router.push(`/places/${place.id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSelectedPlaceId(place.id);
          if (isMobileOrTablet) router.push(`/places/${place.id}`);
        }
      }}
      className="relative cursor-pointer overflow-hidden rounded-radius-md border border-surface-alt bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
    >
      {/* Hero image area */}
      <div className="relative h-[192px] w-full overflow-hidden rounded-t-radius-md bg-surface-alt">
        {place.image_url ? (
          <img
            src={place.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          (() => {
            const vibePath = place.vibe_photo_path?.trim();
            if (vibePath) {
              const objectPath = vibePath.startsWith("user-photos/")
                ? vibePath.slice("user-photos/".length)
                : vibePath;
              const { data } = supabase.storage
                .from("user-photos")
                .getPublicUrl(objectPath);
              return (
                <img
                  src={data.publicUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              );
            }

            const googleRef = place.google_photo_ref?.trim();
            return googleRef ? (
              <img
                src={`/api/places/${place.id}/photo`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-surface-alt" />
            );
          })()
        )}

        <div className="overlay-gradient rounded-t-radius-md" aria-hidden />

        {/* Content layer: pills, title, rating badge, save (bottom-right of hero) */}
        <div className="absolute inset-0 z-0 flex flex-col">
          <div className="absolute left-16 top-16 flex gap-8">
            <Pill variant="placeType">
              {place.place_type
                ? place.place_type.charAt(0).toUpperCase() +
                  place.place_type.slice(1)
                : "Spot"}
            </Pill>
          </div>

          <div className="absolute right-16 top-16">
            <MatchRing score={matchPercent} />
          </div>

          <div className="absolute bottom-12 left-12 right-12 flex flex-col pr-[48px]">
            <h2 className="text-heading-m text-text-inverse">{place.name}</h2>
            <p className="text-body-s text-text-inverse">
              {distanceNeighborhood}
            </p>
          </div>

          <Button
            variant="secondaryIcon"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isSaved) {
                unsaveMutation.mutate();
              } else {
                saveMutation.mutate();
              }
            }}
            className="absolute bottom-12 right-12 z-10 shadow-map"
            disabled={saveMutation.isPending || unsaveMutation.isPending}
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
        </div>
      </div>

      {/* Stats row: equal-width tiles, 8px gap, full width */}
      <div className="grid w-full grid-cols-4 gap-2 p-16">
        <MetricTile
          type="noise"
          value={place.noise}
          iconClassName="text-accent"
        />
        <MetricTile
          type="vibes"
          value={place.dominant_vibe ?? null}
          iconClassName="text-accent"
        />
        <MetricTile type="tables" value={place.tables} />
        <MetricTile
          type="outlets"
          value={place.outlets}
          iconClassName="text-accent"
        />
      </div>

      {/* Amenity tags row */}
      {place.pills.length > 0 && (
        <div className="overflow-x-auto px-12 pb-8">
          <div className="flex gap-8">
            {place.pills.map((pill, pillIndex) => (
              <Pill key={`${pill}-${pillIndex}`}>{pill}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* Footer row */}
      <div className="flex flex-wrap items-center justify-between gap-8 px-16 py-16">
        <div className="flex items-center gap-8">
          {openStatus && (
            <StatusDot
              status={openStatus.status}
              label={openStatus.label}
              subLabel={ratingLabel}
            />
          )}
        </div>
        <Link
          href={`/places/${place.id}/rate?name=${encodeURIComponent(
            place.name,
          )}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex"
        >
          <Button variant={isRated ? "secondary" : "primary"} type="button">
            {isRated ? (
              <span className="flex items-center gap-8">
                <Check size={18} aria-hidden />
                <span>Rated</span>
              </span>
            ) : (
              "Rate"
            )}
          </Button>
        </Link>
      </div>
    </article>
  );
}
