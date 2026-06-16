// NEW COMPONENT
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RatingCard,
  type RatingCardItem,
} from "@/components/social/RatingCard";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { UserListSheet } from "@/components/profile/UserListSheet";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/types/feed";

type UserListItem = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ProfileContentProps = {
  userId: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  stats: {
    placesRated: number;
    photosUploaded: number;
    placesSaved: number;
    followersCount: number;
    followingCount: number;
  };
  isOwnProfile: boolean;
  initialIsFollowing?: boolean;
};

export function ProfileContent({
  userId,
  fullName,
  email,
  avatarUrl,
  stats,
  isOwnProfile,
  initialIsFollowing = false,
}: ProfileContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"ratings" | "saved">("ratings");
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);

  // Ratings tab
  const ratingsQuery = useQuery<RatingCardItem[]>({
    queryKey: ["profile-ratings", userId],
    queryFn: async () => {
      const res = await fetch(`/api/user/${userId}/ratings`, {
        credentials: "same-origin",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load ratings");
      return Array.isArray(body?.data) ? body.data : [];
    },
    enabled: activeTab === "ratings",
  });

  // Saved tab
  const savedQuery = useQuery<FeedItem[]>({
    queryKey: ["profile-saved", userId],
    queryFn: async () => {
      const res = await fetch(`/api/user/${userId}/saved`, {
        credentials: "same-origin",
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body?.error ?? "Failed to load saved places");
      return Array.isArray(body?.data) ? body.data : [];
    },
    enabled: activeTab === "saved",
  });

  // Followers sheet data
  const followersQuery = useQuery<UserListItem[]>({
    queryKey: ["profile-followers", userId],
    queryFn: async () => {
      const res = await fetch(`/api/user/${userId}/followers`, {
        credentials: "same-origin",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load followers");
      return Array.isArray(body?.data) ? body.data : [];
    },
    enabled: followersOpen,
  });

  // Following sheet data
  const followingQuery = useQuery<UserListItem[]>({
    queryKey: ["profile-following", userId],
    queryFn: async () => {
      const res = await fetch(`/api/user/${userId}/following`, {
        credentials: "same-origin",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load following");
      return Array.isArray(body?.data) ? body.data : [];
    },
    enabled: followingOpen,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/social/follow/${userId}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to follow",
        );
      }
    },
    onMutate: () => setIsFollowing(true),
    onError: () => setIsFollowing(false),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile-followers", userId],
      });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/social/follow/${userId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to unfollow",
        );
      }
    },
    onMutate: () => setIsFollowing(false),
    onError: () => setIsFollowing(true),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile-followers", userId],
      });
    },
  });

  async function handleFollowClick() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push(`/signup?next=${encodeURIComponent(`/profile/${userId}`)}`);
      return;
    }
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  }

  async function handleLogout() {
    localStorage.setItem("justLoggedOut", "true");
    await fetch("/api/dev-auth/logout", { method: "POST" }).catch(() => null);
    const supabase = createClient();
    await supabase.auth.signOut();
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      const posthog = (await import("posthog-js")).default;
      posthog.reset();
    }
    router.push("/login");
  }

  return (
    <>
      {/* Avatar */}
      <div className="mb-16 flex justify-center">
        <div className="flex h-80 w-80 items-center justify-center overflow-hidden rounded-full bg-surface-alt text-text shadow-map">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-full w-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <User2 size={40} className="text-primary" aria-hidden />
          )}
        </div>
      </div>

      {/* Name */}
      <h1 className="mb-4 text-center font-lora text-heading-l text-text">
        {fullName}
      </h1>

      {/* Email */}
      {email && (
        <p className="mb-16 text-center text-body-m text-text-secondary">
          {email}
        </p>
      )}

      {/* Follow/Unfollow — only shown on other users' profiles */}
      {!isOwnProfile && (
        <div className="mb-24 flex justify-center">
          <Button
            variant={isFollowing ? "secondary" : "primary"}
            onClick={handleFollowClick}
            disabled={followMutation.isPending || unfollowMutation.isPending}
          >
            {isFollowing ? "Unfollow" : "Follow"}
          </Button>
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-8">
          {/* Static stats */}
          <div className="flex flex-1 flex-col items-center rounded-radius-md bg-surface px-8 py-12 text-center">
            <span className="text-heading-l text-text">
              {stats.placesRated}
            </span>
            <span className="mt-4 text-body-s text-text-secondary">
              Places rated
            </span>
          </div>
          {/* Followers button */}
          <button
            type="button"
            onClick={() => setFollowersOpen(true)}
            className="flex flex-1 flex-col items-center rounded-radius-md bg-surface px-8 py-12 text-center"
          >
            <span className="text-heading-l text-text">
              {stats.followersCount}
            </span>
            <span className="mt-4 text-body-s text-text-secondary">
              Followers
            </span>
          </button>

          {/* Following button */}
          <button
            type="button"
            onClick={() => setFollowingOpen(true)}
            className="flex flex-1 flex-col items-center rounded-radius-md bg-surface px-8 py-12 text-center"
          >
            <span className="text-heading-l text-text">
              {stats.followingCount}
            </span>
            <span className="mt-4 text-body-s text-text-secondary">
              Following
            </span>
          </button>
      </div>

      {/* Tab switcher */}
      <div className="mb-16 border-b border-surface-alt">
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab("ratings")}
            className={`flex-1 py-12 text-ui-label-l ${
              activeTab === "ratings"
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary"
            }`}
          >
            Ratings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("saved")}
            className={`flex-1 py-12 text-ui-label-l ${
              activeTab === "saved"
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary"
            }`}
          >
            Saved
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "ratings" && (
        <div>
          {ratingsQuery.isLoading && (
            <div className="space-y-12">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-radius-md bg-surface-alt"
                  aria-hidden
                />
              ))}
            </div>
          )}
          {ratingsQuery.isError && (
            <p className="py-16 text-center text-body-m text-text-secondary">
              {ratingsQuery.error instanceof Error
                ? ratingsQuery.error.message
                : "Failed to load ratings"}
            </p>
          )}
          {!ratingsQuery.isLoading &&
            !ratingsQuery.isError &&
            (ratingsQuery.data?.length ?? 0) === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <User2
                  size={40}
                  strokeWidth={1.5}
                  className="mb-8 text-text-tertiary"
                  aria-hidden
                />
                <p className="text-body-m text-text-secondary">
                  No ratings yet
                </p>
              </div>
            )}
          {!ratingsQuery.isLoading &&
            !ratingsQuery.isError &&
            (ratingsQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-12">
                {ratingsQuery.data!.map((item) => (
                  <RatingCard
                    key={item.id}
                    showUserHeader={false}
                    item={item}
                  />
                ))}
              </div>
            )}
        </div>
      )}

      {activeTab === "saved" && (
        <div>
          {savedQuery.isLoading && (
            <div className="space-y-12">
              {Array.from({ length: 3 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          )}
          {savedQuery.isError && (
            <p className="py-16 text-center text-body-m text-text-secondary">
              {savedQuery.error instanceof Error
                ? savedQuery.error.message
                : "Failed to load saved places"}
            </p>
          )}
          {!savedQuery.isLoading &&
            !savedQuery.isError &&
            (savedQuery.data?.length ?? 0) === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <User2
                  size={40}
                  strokeWidth={1.5}
                  className="mb-8 text-text-tertiary"
                  aria-hidden
                />
                <p className="text-body-m text-text-secondary">
                  No saved places yet
                </p>
              </div>
            )}
          {!savedQuery.isLoading &&
            !savedQuery.isError &&
            (savedQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-12">
                {savedQuery.data!.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            )}
        </div>
      )}

      {/* Footer */}
      {isOwnProfile && (
        <div className="mt-24 flex justify-center">
          <button
            type="button"
            onClick={handleLogout}
            className="text-body-m text-accent text-link"
          >
            Log out &rarr;
          </button>
        </div>
      )}

      {/* Sheets */}
      <UserListSheet
        open={followersOpen}
        onClose={() => setFollowersOpen(false)}
        title="Followers"
        users={followersQuery.data ?? []}
        isLoading={followersQuery.isLoading}
      />
      <UserListSheet
        open={followingOpen}
        onClose={() => setFollowingOpen(false)}
        title="Following"
        users={followingQuery.data ?? []}
        isLoading={followingQuery.isLoading}
      />
    </>
  );
}
