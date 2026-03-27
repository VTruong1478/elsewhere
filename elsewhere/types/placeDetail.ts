/** Response body `data` from GET /api/places/[id] */
export type PlaceDetailResponse = {
  place: {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    opening_hours: unknown;
    timezone: string | null;
    rating_count?: number | bigint | null;
    place_type: string;
    google_photo_ref: string | null;
    vibe_photo_path: string | null;
    vibe_photo_ref: string | null;
    vibe_photo_attribution: unknown;
  };
  place_stats: {
    rating_count: number | bigint;
    noise_silent: number | bigint;
    noise_quiet: number | bigint;
    noise_vibrant: number | bigint;
    tables_limited: number | bigint;
    tables_mixed: number | bigint;
    tables_plentiful: number | bigint;
    outlets_scarce: number | bigint;
    outlets_some: number | bigint;
    outlets_ample: number | bigint;
    vibe_focused: number | bigint;
    vibe_casual: number | bigint;
    vibe_social: number | bigint;
    avg_overall_rating: number | string | null;
  };
  is_saved: boolean;
  notes: Array<{
    id: string;
    notes: string;
    created_at: string;
    author_short_name: string;
  }>;
  my_rating?: {
    id: string;
    noise: string;
    vibe: string;
    tables: string;
    outlets: string;
    overall_rating: number;
    photo_path: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};
