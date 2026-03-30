"use client";

import { useRouter } from "next/navigation";
import { Check, Navigation, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ensureAuthForGatedAction } from "@/lib/authGate";
import type { AnalyticsSource } from "@/lib/analytics";

export type RateGateContext = {
  place_id: string;
  place_name: string;
  source: AnalyticsSource;
};

export type PlaceDetailCtaProps = {
  rateHref: string;
  /** When set, Rate navigations require auth; logged-out users are sent to login with resume URL. */
  rateGate?: RateGateContext;
  /** When true: surface bg + border (secondarySurface), "Rated" + check — same idea as PlaceCard's rated state. */
  userHasRated?: boolean;
  /** Defaults to "Rate this Place" (only when userHasRated is false) */
  rateLabel?: string;
  onShare: () => void | Promise<void>;
  onDirections: () => void;
  className?: string;
  /**
   * `viewport`: fixed full width above BottomTabs (mobile / full-screen detail).
   * `panel`: static footer inside a flex column (e.g. desktop `DesktopPlaceDetailPanel`).
   */
  dock?: "viewport" | "panel";
};

/**
 * Primary + secondary actions for place detail. Viewport-fixed above the app
 * tab bar (same idea as BottomTabs): stays visible while the sheet scrolls underneath.
 * z-[35]: above the place sheet (z-30), below BottomTabs (z-40).
 */
export function PlaceDetailCta({
  rateHref,
  rateGate,
  userHasRated = false,
  rateLabel = "Rate this Place",
  onShare,
  onDirections,
  className = "",
  dock = "viewport",
}: PlaceDetailCtaProps) {
  const router = useRouter();

  async function goToRate() {
    if (rateGate) {
      const ok = await ensureAuthForGatedAction(router.push, {
        action_type: "rate_place",
        source: rateGate.source,
        place_id: rateGate.place_id,
        place_name: rateGate.place_name,
        returnPath: rateHref,
      });
      if (!ok) return;
    }
    router.push(rateHref);
  }

  const dockClass =
    dock === "panel"
      ? "pointer-events-none w-full shrink-0 bg-background px-16 pt-12 pb-16"
      : "pointer-events-none fixed inset-x-0 z-[35] bottom-[calc(56px+env(safe-area-inset-bottom,0px))] px-16 pb-8";

  return (
    <div className={[dockClass, className].filter(Boolean).join(" ")}>
      <div className="pointer-events-auto flex flex-col gap-8">
        <Button
          className="w-full shadow-map"
          variant={userHasRated ? "secondarySurface" : "primary"}
          type="button"
          onClick={() => void goToRate()}
        >
          {userHasRated ? (
            <span className="flex items-center gap-8">
              <Check size={18} aria-hidden />
              <span>Rated</span>
            </span>
          ) : (
            rateLabel
          )}
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
