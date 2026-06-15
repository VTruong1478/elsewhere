"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { MatchRing } from "@/components/ui/MatchRing";
import { usePlaceStore } from "@/store/usePlaceStore";
import { userPhotoProxyUrl } from "@/lib/userPhotoProxyUrl";

type SocialFeedItem = {
  id: string;
  overall_rating: number | null;
  noise: string | null;
  vibe: string | null;
  outlets: string | null;
  tables: string | null;
  notes: string | null;
  photo_paths: string[];
  created_at: string;
  place_id: string;
  place_name: string;
  place_type: string;
  rater_id: string;
  rater_name: string | null;
  rater_avatar: string | null;
  match_score_percent: number | null;
  is_saved: boolean;
};

async function fetchSocialFeed(): Promise<SocialFeedItem[]> {
  const res = await fetch("/api/social/feed", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await res.json();
  if (res.status === 401) return [];
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : res.statusText,
    );
  }
  return Array.isArray(body?.data) ? body.data : [];
}

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

function SocialRatingCard({ item }: { item: SocialFeedItem }) {
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

  const initials = (item.rater_name ?? "?").charAt(0).toUpperCase();

  return (
    <article className="overflow-hidden rounded-radius-md border border-surface-alt bg-surface p-16">
      {/* Top row: avatar, "name rated place", match score */}
      <div className="flex items-start justify-between gap-12">
        <div className="flex min-w-0 items-center gap-10">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt">
            {item.rater_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.rater_avatar}
                alt=""
                className="h-full w-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-label-s font-medium text-text-secondary">
                {initials}
              </span>
            )}
          </div>
          <p className="min-w-0 text-body-s text-text-secondary">
            <span className="font-medium text-text">
              {item.rater_name ?? "Anonymous"}
            </span>
            {" rated "}
            <a
              href={`/places/${item.place_id}`}
              onClick={handlePlaceClick}
              className="font-medium text-primary hover:underline"
            >
              {item.place_name}
            </a>
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
              className="mt-4 text-label-s text-primary"
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

function SocialFeedSkeleton() {
  return (
    <div className="space-y-12">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-radius-md border border-surface-alt bg-surface p-16"
          aria-hidden
        >
          <div className="flex items-center gap-10">
            <div className="h-32 w-32 animate-pulse rounded-full bg-surface-alt" />
            <div className="flex flex-col gap-6">
              <div className="h-8 w-40 animate-pulse rounded-radius-sm bg-surface-alt" />
              <div className="h-6 w-24 animate-pulse rounded-radius-sm bg-surface-alt" />
            </div>
          </div>
          <div className="mt-12 h-8 w-32 animate-pulse rounded-radius-sm bg-surface-alt" />
          <div className="mt-10 h-6 w-full animate-pulse rounded-radius-sm bg-surface-alt" />
        </div>
      ))}
    </div>
  );
}

function SocialEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-16 py-32 text-center">
      <Users
        className="mb-8 text-text-tertiary"
        size={48}
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="mb-4 font-lora text-heading-m text-text">No activity yet</p>
      <p className="max-w-sm text-body-m text-text-secondary">
        Follow friends to see their ratings here.
      </p>
    </div>
  );
}

export default function SocialPage() {
  const query = useQuery({
    queryKey: ["social-feed"],
    queryFn: fetchSocialFeed,
  });

  const items = query.data ?? [];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-background">
      <div className="shrink-0 pt-16">
        <div className="px-16">
          <h1 className="font-lora text-heading-l text-text">Social</h1>
        </div>
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-16 py-8 pb-20">
        {query.isLoading && <SocialFeedSkeleton />}
        {query.isError && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="mb-2 font-lora text-heading-m text-text">
              Couldn&apos;t load social feed
            </p>
            <p className="mb-16 max-w-sm text-body-m text-text-secondary">
              {query.error instanceof Error
                ? query.error.message
                : "Something went wrong."}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-radius-sm bg-primary px-8 py-8 text-ui-button text-text-inverse"
            >
              Try again
            </button>
          </div>
        )}
        {!query.isLoading && !query.isError && items.length === 0 && (
          <SocialEmptyState />
        )}
        {!query.isLoading && !query.isError && items.length > 0 && (
          <div className="space-y-12">
            {items.map((item) => (
              <SocialRatingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
