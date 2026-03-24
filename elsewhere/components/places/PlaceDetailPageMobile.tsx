"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PlaceDetailMobile } from "@/components/places/PlaceDetailMobile";

type PlaceDetailPageMobileProps = {
  placeId: string;
  initialCenter: { lat: number; lng: number };
};

/**
 * Mobile/tablet route layout for `/places/[id]`: full-viewport map + bottom sheet,
 * matching the map-tab marker selection flow (same PlaceDetailMobile, mid snap).
 */
export function PlaceDetailPageMobile({
  placeId,
  initialCenter,
}: PlaceDetailPageMobileProps) {
  const router = useRouter();

  return (
    <>
      <div className="pointer-events-auto fixed left-3 top-3 z-40">
        <Button
          variant="secondaryIcon"
          type="button"
          onClick={() => router.back()}
          className="shadow-map"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Button>
      </div>
      <PlaceDetailMobile
        placeId={placeId}
        initialCenter={initialCenter}
        initialSnap="mid"
        onDismiss={() => router.back()}
      />
    </>
  );
}
