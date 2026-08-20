"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DesktopPlaceDetailPanel } from "@/components/feed/DesktopPlaceDetailPanel";

type PlaceDetailPageDesktopProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
};

/**
 * Desktop route layout for `/places/[id]`.
 *
 * Reuses the same panel the feed renders, so a shared link opened on desktop
 * gets full parity (metrics, ratings, save, rate CTA) instead of the previous
 * title-and-photo stub. The panel fetches its own data and does not touch the
 * place store, so it works standalone; it does need a height-constrained flex
 * column, which the wrapper below provides.
 */
export function PlaceDetailPageDesktop({
  placeId,
  initialCenter,
}: PlaceDetailPageDesktopProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceFeedBack = searchParams.get("back_to") === "feed";

  function handleDismiss() {
    if (forceFeedBack) {
      router.push("/feed");
      return;
    }
    router.back();
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-72px)] w-full max-w-2xl flex-col px-16 py-16">
      <DesktopPlaceDetailPanel
        placeId={placeId}
        initialCenter={initialCenter}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
