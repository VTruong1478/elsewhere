// NEW COMPONENT
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { MatchRing } from "@/components/ui/MatchRing";
import { usePlaceStore } from "@/store/usePlaceStore";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";

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
  rater_avatar: string | null;
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

  function handlePlaceClick(e: React.MouseEvent) {
    e.preventDefault();
    setSelectedPlaceId(item.place_id);
    router.push(`/places/${item.place_id}`);
  }

  return (
    <article className="overflow-hidden rounded-radius-md border border-surface-alt bg-surface p-16">
      {/* Top row */}
      {showUserHeader ? (
        <div className="flex items-start justify-between gap-12">
          <div className="flex min-w-0 items-center gap-10">
            {/* Avatar */}
            <Link
              href={`/profile/${item.rater_id}`}
              className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt"
              aria-label={`View ${item.rater_name ?? "Anonymous"}'s profile`}
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
                  {(item.rater_name ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </Link>

            <p className="min-w-0 text-body-s text-text-secondary">
              <Link
                href={`/profile/${item.rater_id}`}
                className="font-medium text-accent text-link"
              >
                {item.rater_name ?? "Anonymous"}
              </Link>
              {" rated "}
              <span className="font-medium text-text">
                {item.place_name}
              </span>
              <span className="ml-8 text-text-tertiary">
                · {timeAgo(item.created_at)}
              </span>
            </p>
          </div>
          {item.match_score_percent != null && (
            <div className="shrink-0">
              <MatchRing score={item.match_score_percent} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-12">
          <div className="min-w-0">
            <a
              href={`/places/${item.place_id}`}
              onClick={handlePlaceClick}
              className="text-body-m font-medium text-text hover:underline"
            >
              {item.place_name}
            </a>
            <p className="mt-4 text-body-s text-text-tertiary">
              {timeAgo(item.created_at)}
            </p>
          </div>
          {item.match_score_percent != null && (
            <div className="shrink-0">
              <MatchRing score={item.match_score_percent} />
            </div>
          )}
        </div>
      )}

      {/* Photo strip */}
      {item.photo_paths.length > 0 && (
        <div className="scrollbar-hide mt-12 flex gap-8 overflow-x-auto">
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

      {/* Notes */}
      {item.notes && (
        <div className="mt-10">
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

      {/* Bottom row: bookmark */}
      <div className="mt-12 flex justify-end">
        <Button
          variant="secondaryIcon"
          type="button"
          onClick={() => {
            if (isSaved) {
              unsaveMutation.mutate();
            } else {
              saveMutation.mutate();
            }
          }}
          disabled={saveMutation.isPending || unsaveMutation.isPending}
          aria-label={
            isSaved
              ? `Remove ${item.place_name} from saved places`
              : `Save ${item.place_name}`
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
    </article>
  );
}
