"use client";

import { Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RatingCard, type RatingCardItem } from "@/components/social/RatingCard";

type SocialFeedItem = RatingCardItem & {
  overall_rating: number | null;
  noise: string | null;
  vibe: string | null;
  outlets: string | null;
  tables: string | null;
  place_type: string;
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
              <RatingCard key={item.id} showUserHeader={true} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
