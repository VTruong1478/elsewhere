"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface FollowCardProps {
  avatarUrl: string | null;
  username: string;
  relevanceText: string;
  isFollowing: boolean;
  onFollow: () => void;
  onDismiss: () => void;
}

export function FollowCard({
  avatarUrl,
  username,
  relevanceText,
  isFollowing,
  onFollow,
  onDismiss,
}: FollowCardProps) {
  return (
    <article className="relative w-full rounded-radius-md bg-surface p-16">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-16 top-16 flex items-center justify-center text-primary"
        aria-label="Dismiss"
      >
        <X size={16} aria-hidden />
      </button>

      <div className="flex flex-col items-center gap-16">
        <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-ui-label-m text-text-secondary">
              {username.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-4">
          <span className="text-ui-label-m text-accent">@{username}</span>
          <span className="text-ui-label-m text-text-secondary">
            {relevanceText}
          </span>
        </div>

        <Button variant="secondary" onClick={onFollow} className="w-full">
          {isFollowing ? "Unfollow" : "Follow"}
        </Button>
      </div>
    </article>
  );
}
