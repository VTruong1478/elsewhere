import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PhotoAttribution } from "@/components/ui/PhotoAttribution";
import type { PhotoAttributionPayload } from "@/components/ui/PhotoAttribution";
import { PlaceDetailPageMobile } from "@/components/places/PlaceDetailPageMobile";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const FALLBACK_CENTER = { lat: 38.8304, lng: -77.1941 };

  const supabase = await createClient();
  const { data: place, error } = await supabase
    .from("places")
    .select(
      "id, name, address, lat, lng, vibe_photo_ref, google_photo_ref, vibe_photo_attribution, opening_hours, timezone",
    )
    .eq("id", id)
    .single();

  const placeRow = !error && place ? place : null;

  const photoRef =
    placeRow
      ? ((placeRow.vibe_photo_ref as string | null)?.trim() ||
          (placeRow.google_photo_ref as string | null)?.trim())
      : null;
  const attribution =
    placeRow
      ? ((placeRow.vibe_photo_attribution as PhotoAttributionPayload) ?? null)
      : null;

  const initialCenter = placeRow
    ? { lat: Number(placeRow.lat), lng: Number(placeRow.lng) }
    : FALLBACK_CENTER;

  return (
    <>
      {/* Desktop/tablet >= lg: keep existing layout unchanged */}
      <div className="hidden min-h-screen bg-surface p-4 lg:block">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/feed"
            className="text-ui-label-m text-text-tertiary hover:text-text"
          >
            ← Back to feed
          </Link>
          <h1 className="font-lora text-heading-l text-text mt-4">
            {(placeRow?.name as string) ?? "Place"}
          </h1>
          <p className="text-body-m text-text-secondary mt-1">
            {(placeRow?.address as string) ?? ""}
          </p>
          {photoRef && (
            <div className="mt-6">
              <img
                src={`/api/place-photo?ref=${encodeURIComponent(photoRef)}`}
                alt=""
                className="w-full rounded-radius-md object-cover"
              />
              <PhotoAttribution
                attribution={attribution}
                className="mt-2"
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile/tablet < lg: map background + draggable place bottom sheet (same as map marker) */}
      <div className="lg:hidden">
        <PlaceDetailPageMobile placeId={id} initialCenter={initialCenter} />
      </div>
    </>
  );
}
