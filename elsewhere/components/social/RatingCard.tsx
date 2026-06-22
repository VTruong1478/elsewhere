// NEW COMPONENT
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Heart,
  Headphones,
  Plug,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PiPicnicTableBold } from "react-icons/pi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MatchRing } from "@/components/ui/MatchRing";
import { usePlaceStore } from "@/store/usePlaceStore";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";
import { SocialPlaceCard } from "@/components/social/SocialPlaceCard";
import { formatPlaceTypeForDisplay } from "@/lib/placeTypeDisplay";

export type RatingCardItem = {
  id: string;
  notes: string | null;
  photo_paths: string[];
  created_at: string;
  place_id: string;
  place_name: string;
  match_score_percent: number | null;
  is_saved: boolean;
  rater_id: string;
  rater_name: string | null;
  rater_username: string | null;
  rater_avatar: string | null;
  place_type?: string | null;
  google_photo_ref?: string | null;
  place_category?: string | null;
  place_thumbnail_url?: string | null;
  distance?: string | null;
  noise?: string | null;
  vibe?: string | null;
  tables?: string | null;
  outlets?: string | null;
  like_count?: number;
  comment_count?: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RatingCard({
  item,
  showUserHeader = true,
}: {
  item: RatingCardItem;
  showUserHeader?: boolean;
}) {
  const router = useRouter();
  const { setSelectedPlaceId } = usePlaceStore();
  const queryClient = useQueryClient();
  const [isSaved, setIsSaved] = useState(item.is_saved);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesClamped, setNotesClamped] = useState(false);
  const notesRef = useRef<HTMLParagraphElement>(null);
  const metricsRef = useRef<HTMLDivElement>(null);
  const metricsDrag = useRef({ active: false, startX: 0, scrollLeft: 0 });

  function onMetricsMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const el = metricsRef.current;
    if (!el) return;
    metricsDrag.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }

  function onMetricsMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = metricsRef.current;
    if (!metricsDrag.current.active || !el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = metricsDrag.current.scrollLeft - (x - metricsDrag.current.startX);
  }

  function onMetricsMouseUp() {
    metricsDrag.current.active = false;
    const el = metricsRef.current;
    if (!el) return;
    el.style.cursor = "grab";
    el.style.removeProperty("user-select");
  }

  useEffect(() => {
    if (notesRef.current) {
      setNotesClamped(
        notesRef.current.scrollHeight > notesRef.current.clientHeight,
      );
    }
  }, [item.notes]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/saved", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: item.place_id }),
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
      const res = await fetch(
        `/api/saved/${encodeURIComponent(item.place_id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
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

  function handlePlaceNavigate() {
    setSelectedPlaceId(item.place_id);
    router.push(`/places/${item.place_id}`);
  }

  function handleBookmark() {
    if (isSaved) {
      unsaveMutation.mutate();
    } else {
      saveMutation.mutate();
    }
  }

  return (
    <article className="flex flex-col gap-16 rounded-radius-md border border-surface-alt bg-surface p-16">
      {/* Top row */}
      {showUserHeader ? (
        <div className="flex items-start justify-between gap-12">
          <div className="flex min-w-0 items-center gap-10">
            {/* Avatar */}
            <Link
              href={`/profile/${item.rater_id}`}
              className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt"
              aria-label={`View ${item.rater_username ? `@${item.rater_username}` : (item.rater_name ?? "Anonymous")}'s profile`}
            >
              {item.rater_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.rater_avatar}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-ui-label-s font-medium text-text-secondary">
                  {(item.rater_username ?? item.rater_name ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </Link>

            <p className="min-w-0 text-ui-label-m text-text-secondary">
              <Link
                href={`/profile/${item.rater_id}`}
                className="text-accent"
              >
                {item.rater_username
                  ? `@${item.rater_username}`
                  : (item.rater_name ?? "Anonymous")}
              </Link>
              <span className="ml-8 font-normal">· {timeAgo(item.created_at)}</span>
            </p>
          </div>
          {item.match_score_percent != null && (
            <div className="shrink-0">
              <MatchRing score={item.match_score_percent} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-ui-label-m text-text-secondary">
            {timeAgo(item.created_at)}
          </p>
          {item.match_score_percent != null && (
            <div className="shrink-0">
              <MatchRing score={item.match_score_percent} />
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div>
          <p
            ref={notesRef}
            className={`text-body-s text-text-secondary ${notesExpanded ? "" : "line-clamp-3"}`}
          >
            {item.notes}
          </p>
          {(notesClamped || notesExpanded) && (
            <button
              type="button"
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="mt-4 text-ui-label-s text-primary"
            >
              {notesExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Metric chips */}
      {(item.noise || item.vibe || item.tables || item.outlets) && (
        <div
          ref={metricsRef}
          className="scrollbar-hide flex gap-8 overflow-x-auto cursor-grab"
          onMouseDown={onMetricsMouseDown}
          onMouseMove={onMetricsMouseMove}
          onMouseUp={onMetricsMouseUp}
          onMouseLeave={onMetricsMouseUp}
        >
          {item.noise && (
            <div className="flex shrink-0 items-center gap-8 rounded-radius-sm bg-surface-chip px-8 py-4">
              <span className="text-accent">
                {item.noise === "silent" ? (
                  <VolumeX size={20} aria-hidden />
                ) : item.noise === "quiet" ? (
                  <Volume1 size={20} aria-hidden />
                ) : (
                  <Volume2 size={20} aria-hidden />
                )}
              </span>
              <span className="text-ui-overline text-text-secondary">
                {item.noise}
              </span>
            </div>
          )}
          {item.vibe && (
            <div className="flex shrink-0 items-center gap-8 rounded-radius-sm bg-surface-chip px-8 py-4">
              <span className="text-accent">
                <Headphones size={20} aria-hidden />
              </span>
              <span className="text-ui-overline text-text-secondary">
                {item.vibe}
              </span>
            </div>
          )}
          {item.tables && (
            <div className="flex shrink-0 items-center gap-8 rounded-radius-sm bg-surface-chip px-8 py-4">
              <span className="text-accent">
                <PiPicnicTableBold size={20} aria-hidden />
              </span>
              <span className="text-ui-overline text-text-secondary">
                {item.tables}
              </span>
            </div>
          )}
          {item.outlets && (
            <div className="flex shrink-0 items-center gap-8 rounded-radius-sm bg-surface-chip px-8 py-4">
              <span className="text-accent">
                <Plug size={20} aria-hidden />
              </span>
              <span className="text-ui-overline text-text-secondary">
                {item.outlets}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Social Place Card */}
      <SocialPlaceCard
        placeId={item.place_id}
        placeName={item.place_name}
        placeCategory={
          item.place_category ??
          (item.place_type ? formatPlaceTypeForDisplay(item.place_type) : null)
        }
        distance={item.distance}
        thumbnailUrl={
          item.place_thumbnail_url ??
          (item.google_photo_ref ? `/api/places/${item.place_id}/photo` : null)
        }
        isSaved={isSaved}
        onBookmark={handleBookmark}
        isBookmarkPending={saveMutation.isPending || unsaveMutation.isPending}
        onPlaceClick={handlePlaceNavigate}
      />

      {/* Photo gallery */}
      {item.photo_paths.length > 0 && (
        <div className="scrollbar-hide flex gap-16 overflow-x-auto">
          {item.photo_paths.map((path) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={path}
              src={userPhotoProxyUrl(path)}
              alt=""
              className="h-[120px] w-auto shrink-0 rounded-radius-sm object-cover"
            />
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-16">
        <button
          type="button"
          aria-label="Comment"
          className="flex items-center gap-8 text-primary"
        >
          <MessageCircle size={18} aria-hidden />
          {item.comment_count != null && (
            <span className="text-ui-label-m">{item.comment_count}</span>
          )}
        </button>
        <button
          type="button"
          aria-label="Like"
          className="flex items-center gap-8 text-primary"
        >
          <Heart size={18} aria-hidden />
          {item.like_count != null && (
            <span className="text-ui-label-m">{item.like_count}</span>
          )}
        </button>
      </div>
    </article>
  );
}
