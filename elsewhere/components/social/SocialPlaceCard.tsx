"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";

type SocialPlaceCardProps = {
  placeId: string;
  placeName: string;
  placeCategory?: string | null;
  distance?: string | null;
  thumbnailUrl?: string | null;
  isSaved: boolean;
  onBookmark: () => void;
  isBookmarkPending?: boolean;
  onPlaceClick?: () => void;
};

export function SocialPlaceCard({
  placeId,
  placeName,
  placeCategory,
  distance,
  thumbnailUrl,
  isSaved,
  onBookmark,
  isBookmarkPending,
  onPlaceClick,
}: SocialPlaceCardProps) {
  const subtitle = [placeCategory, distance].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full items-center gap-8 rounded-radius-sm border-[0.5px] border-text-secondary bg-surface p-8">
      <Link
        href={`/places/${placeId}`}
        onClick={(e) => {
          if (onPlaceClick) {
            e.preventDefault();
            onPlaceClick();
          }
        }}
        className="flex min-w-0 flex-1 items-stretch gap-8"
      >
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="w-[48px] shrink-0 rounded-radius-sm object-cover"
          />
        )}
        <div className="flex min-w-0 flex-col justify-center">
          <p className="truncate text-heading-s text-text">{placeName}</p>
          {subtitle && (
            <p className="truncate text-body-s text-text">{subtitle}</p>
          )}
        </div>
      </Link>
      <Button
        variant="secondaryIcon"
        type="button"
        onClick={onBookmark}
        disabled={isBookmarkPending}
        aria-label={
          isSaved
            ? `Remove ${placeName} from saved places`
            : `Save ${placeName}`
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
  );
}
