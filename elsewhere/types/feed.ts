export type NoiseLabel = "Silent" | "Quiet" | "Vibrant";
export type VibeLabel = "Focused" | "Casual" | "Social";
export type TablesLabel = "limited" | "mixed" | "plentiful";
export type OutletsLabel = "scarce" | "some" | "ample";

export interface FeedItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  noise: NoiseLabel | null;
  // Backend-plan naming (dominant labels derived from place_stats counts)
  dominant_noise?: NoiseLabel | null;
  /** Dominant vibe label when available */
  vibe?: VibeLabel | null;
  /** Dominant vibe label computed from place_stats (respects "Not enough data") */
  dominant_vibe?: VibeLabel | null;
  dominant_tables?: TablesLabel | null;
  dominant_outlets?: OutletsLabel | null;
  tables: TablesLabel | null;
  outlets: OutletsLabel | null;
  match_score_percent: number | null;
  why_matched: string[];
  open_now: boolean;
  closes_at: string | null;
  closing_soon: boolean;
  open_late: boolean;
  pills: string[];
  is_favorited?: boolean;
  user_has_rated?: boolean;
  /** Distance from user in miles (when available) */
  distance_mi?: number;
  /** Neighborhood or area label (when available) */
  neighborhood?: string;
  /** Place photo URL (when available) */
  image_url?: string | null;
  /** Google Places (New) photo name for /api/place-photo (when available) */
  google_photo_ref?: string | null;
  /** Admin-selected vibe photo ref (preferred over google_photo_ref when set) */
  vibe_photo_ref?: string | null;
  /** Admin-selected vibe photo (manual user photo promo) storage path */
  vibe_photo_path?: string | null;
  /** Attribution for vibe photo: { authorAttributions?: Array<{ displayName?, uri? }> } */
  vibe_photo_attribution?: unknown;
  /** Number of ratings (when available) */
  rating_count?: number;
  /** Cost indicator for card pill, e.g. "Free" or "$" (when available) */
  cost?: string | null;
}

export type FeedFilter =
  | ""
  | "quiet"
  | "cafes"
  | "libraries"
  | "tea_shops"
  | "open_now";

export const FEED_FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "", label: "All spots" },
  { value: "open_now", label: "Open now" },
  { value: "quiet", label: "Quiet" },
  { value: "cafes", label: "Cafes" },
  { value: "libraries", label: "Libraries" },
  { value: "tea_shops", label: "Tea Shop" },
];
