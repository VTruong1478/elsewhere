"use client";

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
  if (!res.ok) return [];
  return Array.isArray(body?.data) ? body.data : [];
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

export function SocialFeedSection() {
  const query = useQuery({
    queryKey: ["social-feed"],
    queryFn: fetchSocialFeed,
  });

  if (query.isLoading) return <SocialFeedSkeleton />;

  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="mb-8 text-ui-overline text-text-secondary">FOLLOWING</h2>
      <div className="space-y-12">
        {items.map((item) => (
          <RatingCard key={item.id} item={item} showUserHeader />
        ))}
      </div>
    </section>
  );
}
