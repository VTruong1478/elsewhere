import { createClient } from "@/lib/supabase/server";
import { PlaceDetailPageMobile } from "@/components/places/PlaceDetailPageMobile";
import { PlaceDetailPageDesktop } from "@/components/places/PlaceDetailPageDesktop";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const FALLBACK_CENTER = { lat: 38.8304, lng: -77.1941 };

  const supabase = await createClient();
  const { data: place, error } = await supabase
    .from("places")
    .select("id, lat, lng")
    .eq("id", id)
    .single();

  const placeRow = !error && place ? place : null;

  const initialCenter = placeRow
    ? { lat: Number(placeRow.lat), lng: Number(placeRow.lng) }
    : FALLBACK_CENTER;

  return (
    <>
      {/* Desktop >= lg: same detail panel the feed renders, for full parity. */}
      <div className="hidden lg:block">
        <PlaceDetailPageDesktop placeId={id} initialCenter={initialCenter} />
      </div>

      {/* Mobile/tablet < lg: map background + draggable place bottom sheet (same as map marker) */}
      <div className="lg:hidden">
        <PlaceDetailPageMobile placeId={id} initialCenter={initialCenter} />
      </div>
    </>
  );
}
