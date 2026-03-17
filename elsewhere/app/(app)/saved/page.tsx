"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/types/feed";
import { PlaceCard } from "@/components/feed/PlaceCard";
import { PlaceCardSkeleton } from "@/components/feed/PlaceCardSkeleton";
import { MapPin } from "lucide-react";

type SavedRow = {
  place_id: string;
  saved_at: string;
};

type LocationState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "ready"; lat: number; lng: number };

const LOCATION_TIMEOUT_MS = 10_000;

function useUserLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ status: "loading" });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setState({ status: "denied" });
    }, LOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setState({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setState({ status: "denied" });
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return state;
}

async function fetchSaved(): Promise<SavedRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved")
    .select("place_id, saved_at")
    .order("saved_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchFeedForCoords(
  lat: number,
  lng: number,
): Promise<FeedItem[]> {
  const sp = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });

  const res = await fetch(`/api/feed?${sp.toString()}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : res.statusText,
    );
  }
  return Array.isArray(body?.data) ? body.data : (body ?? []);
}

function SavedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-16 text-center">
      <MapPin
        className="mb-8 text-text-tertiary"
        size={48}
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="mb-4 font-lora text-heading-m text-text">
        No saved spots yet
      </p>
      <p className="max-w-sm text-body-m text-text-secondary">
        Explore the feed and tap the bookmark icon to save places you want to
        try.
      </p>
    </div>
  );
}

export default function SavedPage() {
  const locationState = useUserLocation();

  const savedQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: fetchSaved,
  });

  const coords =
    locationState.status === "ready"
      ? { lat: locationState.lat, lng: locationState.lng }
      : null;

  const feedQuery = useQuery({
    queryKey: ["saved-feed", coords?.lat, coords?.lng],
    queryFn: () => fetchFeedForCoords(coords!.lat, coords!.lng),
    enabled: coords != null && savedQuery.data != null,
  });

  const savedRows = savedQuery.data ?? [];
  const allFeedItems = feedQuery.data ?? [];
  const feedById = new Map(allFeedItems.map((item) => [item.id, item]));

  const places: FeedItem[] = [];
  for (const row of savedRows) {
    const item = feedById.get(row.place_id);
    if (item) {
      places.push({ ...item, is_favorited: true });
    }
  }

  const isLoading =
    savedQuery.isLoading || (coords != null && feedQuery.isLoading);

  return (
    <main className="min-h-screen bg-background px-16 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="mb-16 font-lora text-heading-l text-text">Saved</h1>
        {isLoading && (
          <div className="space-y-12">
            {Array.from({ length: 3 }).map((_, i) => (
              <PlaceCardSkeleton key={i} />
            ))}
          </div>
        )}
        {!isLoading && places.length === 0 && <SavedEmptyState />}
        {!isLoading && places.length > 0 && (
          <div className="space-y-12">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

