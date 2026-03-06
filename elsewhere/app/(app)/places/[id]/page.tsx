import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PhotoAttribution } from "@/components/ui/PhotoAttribution";
import type { PhotoAttributionPayload } from "@/components/ui/PhotoAttribution";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: place, error } = await supabase
    .from("places")
    .select(
      "id, name, address, vibe_photo_ref, google_photo_ref, vibe_photo_attribution",
    )
    .eq("id", id)
    .single();

  if (error || !place) notFound();

  const photoRef =
    (place.vibe_photo_ref as string | null)?.trim() ||
    (place.google_photo_ref as string | null)?.trim();
  const attribution =
    (place.vibe_photo_attribution as PhotoAttributionPayload) ?? null;

  return (
    <div className="min-h-screen bg-surface p-4 ">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/feed"
          className="text-ui-label-m text-text-tertiary hover:text-text"
        >
          ← Back to feed
        </Link>
        <h1 className="font-lora text-heading-l text-text mt-4">
          {place.name as string}
        </h1>
        <p className="text-body-m text-text-secondary mt-1">
          {place.address as string}
        </p>
        {photoRef && (
          <div className="mt-6">
            <img
              src={`/api/place-photo?ref=${encodeURIComponent(photoRef)}`}
              alt=""
              className="w-full rounded-radius-md object-cover"
            />
            <PhotoAttribution attribution={attribution} className="mt-2" />
          </div>
        )}
      </div>
    </div>
  );
}
