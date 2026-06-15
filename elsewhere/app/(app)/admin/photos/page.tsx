"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type PlaceRow = {
  id: string;
  name: string;
  google_place_id: string | null;
  vibe_photo_ref: string | null;
};

type PhotoOption = {
  ref: string;
  attribution: Array<{ displayName?: string; uri?: string }> | null;
  thumbUrl: string;
};

async function fetchPlaces(): Promise<PlaceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("places")
    .select("id, name, google_place_id, vibe_photo_ref")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchPlacePhotos(googlePlaceId: string): Promise<PhotoOption[]> {
  const res = await fetch(
    `/api/place-photos?placeId=${encodeURIComponent(googlePlaceId)}`,
  );
  if (!res.ok) throw new Error("Failed to load photos");
  const json = await res.json();
  return json.photos ?? [];
}

async function setVibePhoto(
  placeId: string,
  ref: string,
  attribution: unknown,
) {
  const res = await fetch(`/api/admin/places/${placeId}/vibe-photo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, attribution }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Update failed");
  }
}

export default function AdminPhotosPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const placesQuery = useQuery({
    queryKey: ["admin", "places"],
    queryFn: fetchPlaces,
  });

  const places = placesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-surface p-4 ">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-lora text-heading-l text-text">
          Vibe photo selection
        </h1>
        <p className="text-body-m text-text-secondary mt-1">
          Choose a photo for each place. Only places with a Google Place ID can
          load photos.
        </p>
        {placesQuery.isLoading && (
          <p className="text-body-s text-text-tertiary mt-4">Loading places…</p>
        )}
        {placesQuery.isError && (
          <p className="text-body-s text-red-600 mt-4">
            {String(placesQuery.error)}
          </p>
        )}
        <ul className="mt-6 space-y-4">
          {places.map((place) => (
            <li
              key={place.id}
              className="rounded-radius-md border border-surface-alt bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-text">{place.name}</span>
                {place.google_place_id ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expandedId === place.id ? null : place.id)
                    }
                    className="rounded-radius-sm bg-accent px-3 py-1.5 text-ui-button text-text-inverse"
                  >
                    {expandedId === place.id
                      ? "Hide photos"
                      : "Choose vibe photo"}
                  </button>
                ) : (
                  <span className="text-ui-label-s text-text-tertiary">
                    No Google Place ID
                  </span>
                )}
              </div>
              {expandedId === place.id && place.google_place_id && (
                <PlacePhotoPicker
                  placeId={place.id}
                  googlePlaceId={place.google_place_id}
                  currentRef={place.vibe_photo_ref}
                  onSaved={() => {
                    queryClient.invalidateQueries({
                      queryKey: ["admin", "places"],
                    });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlacePhotoPicker({
  placeId,
  googlePlaceId,
  currentRef,
  onSaved,
}: {
  placeId: string;
  googlePlaceId: string;
  currentRef: string | null;
  onSaved: () => void;
}) {
  const query = useQuery({
    queryKey: ["place-photos", googlePlaceId],
    queryFn: () => fetchPlacePhotos(googlePlaceId),
    enabled: !!googlePlaceId,
  });
  const mutation = useMutation({
    mutationFn: ({ ref, attribution }: { ref: string; attribution: unknown }) =>
      setVibePhoto(placeId, ref, attribution),
    onSuccess: onSaved,
  });

  if (query.isLoading)
    return (
      <p className="mt-3 text-ui-label-s text-text-tertiary">Loading photos…</p>
    );
  if (query.isError)
    return (
      <p className="mt-3 text-ui-label-s text-red-600">
        Failed to load photos.
      </p>
    );
  const photos = query.data ?? [];
  if (photos.length === 0)
    return (
      <p className="mt-3 text-ui-label-s text-text-tertiary">
        No photos returned.
      </p>
    );

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {photos.map((photo) => {
        const isSelected = currentRef === photo.ref;
        return (
          <button
            key={photo.ref}
            type="button"
            onClick={() =>
              mutation.mutate({
                ref: photo.ref,
                attribution: photo.attribution
                  ? { authorAttributions: photo.attribution }
                  : null,
              })
            }
            disabled={mutation.isPending}
            className={`relative aspect-[4/3] overflow-hidden rounded-radius-sm border-2 bg-surface-alt ${
              isSelected
                ? "border-accent ring-2 ring-accent"
                : "border-transparent hover:border-surface-alt"
            }`}
          >
            <img
              src={photo.thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {isSelected && (
              <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-ui-label-s text-text-inverse">
                Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
