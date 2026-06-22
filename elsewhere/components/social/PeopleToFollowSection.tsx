"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FollowCard } from "@/components/social/FollowCard";

type SuggestionUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  follower_count: number;
};

async function fetchSuggestions(): Promise<SuggestionUser[]> {
  const res = await fetch("/api/social/suggestions", {
    credentials: "same-origin",
  });
  const body = await res.json();
  if (!res.ok) return [];
  return Array.isArray(body?.data) ? body.data : [];
}

function relevanceText(user: SuggestionUser): string {
  if (user.follower_count === 0) return "New to Elsewhere";
  if (user.follower_count === 1) return "Followed by 1 person";
  return `Followed by ${user.follower_count} people`;
}

export function PeopleToFollowSection() {
  const queryClient = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [followingIds, setFollowingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const query = useQuery({
    queryKey: ["social-suggestions"],
    queryFn: fetchSuggestions,
  });

  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/social/follow/${userId}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to follow");
    },
    onMutate: (userId) =>
      setFollowingIds((prev) => new Set([...prev, userId])),
    onError: (_err, userId) =>
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["social-feed"] }),
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/social/follow/${userId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to unfollow");
    },
    onMutate: (userId) =>
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      }),
    onError: (_err, userId) =>
      setFollowingIds((prev) => new Set([...prev, userId])),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["social-feed"] }),
  });

  const visible = (query.data ?? []).filter((u) => !dismissedIds.has(u.id));

  if (!query.isLoading && visible.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="mb-8 text-ui-overline text-text-secondary">
        MORE PEOPLE TO FOLLOW
      </h2>
      <div className="scrollbar-hide flex gap-12 overflow-x-auto">
        {query.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[180px] min-w-[160px] shrink-0 animate-pulse rounded-radius-md bg-surface-alt"
              />
            ))
          : visible.map((user) => {
              const isFollowing = followingIds.has(user.id);
              return (
                <div key={user.id} className="min-w-[160px] shrink-0">
                  <FollowCard
                    avatarUrl={user.avatar_url}
                    username={user.username}
                    relevanceText={relevanceText(user)}
                    isFollowing={isFollowing}
                    onFollow={() => {
                      if (isFollowing) {
                        unfollowMutation.mutate(user.id);
                      } else {
                        followMutation.mutate(user.id);
                      }
                    }}
                    onDismiss={() =>
                      setDismissedIds((prev) => new Set([...prev, user.id]))
                    }
                  />
                </div>
              );
            })}
      </div>
    </section>
  );
}
