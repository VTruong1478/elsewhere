"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { RatingCard, type RatingCardItem } from "@/components/social/RatingCard";

type SocialFeedItem = RatingCardItem & {
  overall_rating: number | null;
  noise: string | null;
  vibe: string | null;
  outlets: string | null;
  tables: string | null;
  place_type: string;
};

type SocialFeedPage = {
  data: SocialFeedItem[];
  has_older: boolean;
  oldest_created_at: string | null;
};

async function fetchSocialFeedPage(
  before: string | null,
): Promise<SocialFeedPage> {
  const url = before
    ? `/api/social/feed?before=${encodeURIComponent(before)}`
    : "/api/social/feed";
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const body = await res.json();
  if (res.status === 401 || !res.ok) {
    return { data: [], has_older: false, oldest_created_at: null };
  }
  return {
    data: Array.isArray(body?.data) ? body.data : [],
    has_older: body?.has_older ?? false,
    oldest_created_at: body?.oldest_created_at ?? null,
  };
}

function SocialFeedSkeleton() {
  return (
    <div className="mb-16 space-y-12">
      <div className="h-8 w-24 animate-pulse rounded-radius-sm bg-surface-alt" />
      {Array.from({ length: 3 }).map((_, i) => (
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

function CaughtUpDivider({
  hasOlder,
  onLoadOlder,
  isLoading,
}: {
  hasOlder: boolean;
  onLoadOlder: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-12 py-8">
      <div className="h-px flex-1 bg-surface-alt" />
      <div className="flex shrink-0 flex-col items-center gap-4">
        <span className="text-body-s text-text-tertiary">
          You&apos;re all caught up
        </span>
        {hasOlder && (
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoading}
            className="text-body-s text-accent disabled:opacity-50"
            aria-label="View older ratings"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              "View older"
            )}
          </button>
        )}
      </div>
      <div className="h-px flex-1 bg-surface-alt" />
    </div>
  );
}

export function SocialFeedSection() {
  const hasFiredViewedRef = useRef(false);

  const query = useInfiniteQuery({
    queryKey: ["social-feed"],
    queryFn: ({ pageParam }) => fetchSocialFeedPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.has_older && lastPage.oldest_created_at != null
        ? lastPage.oldest_created_at
        : undefined,
  });

  // Fire last_feed_view_at update exactly once, after the initial query resolves.
  // Sequenced here (not before) so the cutoff used for the initial fetch is
  // based on the previous session's timestamp, not the current one.
  useEffect(() => {
    if (!query.isSuccess || hasFiredViewedRef.current) return;
    hasFiredViewedRef.current = true;
    void fetch("/api/social/feed-viewed", {
      method: "POST",
      credentials: "same-origin",
    });
  }, [query.isSuccess]);

  if (query.isLoading) return <SocialFeedSkeleton />;

  const allItems = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (allItems.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="mb-8 text-ui-overline text-text-secondary">FOLLOWING</h2>
      <div className="space-y-12">
        {allItems.map((item) => (
          <RatingCard key={item.id} item={item} showUserHeader />
        ))}
      </div>
      <CaughtUpDivider
        hasOlder={query.hasNextPage ?? false}
        onLoadOlder={() => void query.fetchNextPage()}
        isLoading={query.isFetchingNextPage}
      />
    </section>
  );
}
