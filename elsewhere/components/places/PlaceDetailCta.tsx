"use client";

import { useRouter } from "next/navigation";
import { Navigation, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type PlaceDetailCtaProps = {
  rateHref: string;
  /** Defaults to "Rate this Place" */
  rateLabel?: string;
  onShare: () => void | Promise<void>;
  onDirections: () => void;
  className?: string;
};

/**
 * Primary + secondary actions for place detail. Viewport-fixed above the app
 * tab bar (same idea as BottomTabs): stays visible while the sheet scrolls underneath.
 * z-[35]: above the place sheet (z-30), below BottomTabs (z-40).
 */
export function PlaceDetailCta({
  rateHref,
  rateLabel = "Rate this Place",
  onShare,
  onDirections,
  className = "",
}: PlaceDetailCtaProps) {
  const router = useRouter();

  return (
    <div
      className={[
        "pointer-events-none fixed left-0 right-0 z-[35]",
        "bottom-[calc(56px+env(safe-area-inset-bottom,0px))]",
        "px-16 pb-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="pointer-events-auto flex flex-col gap-8">
        <Button
          className="w-full shadow-map"
          variant="primary"
          onClick={() => router.push(rateHref)}
        >
          {rateLabel}
        </Button>

        <div className="flex gap-8">
          <Button
            variant="secondarySurface"
            className="w-full flex-1 shadow-map"
            onClick={() => void onShare()}
          >
            <span className="inline-flex items-center gap-8">
              <Share2 size={18} aria-hidden className="shrink-0" />
              Share
            </span>
          </Button>
          <Button
            variant="secondarySurface"
            className="w-full flex-1 shadow-map"
            onClick={onDirections}
          >
            <span className="inline-flex items-center gap-8">
              <Navigation size={18} aria-hidden className="shrink-0" />
              Directions
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
