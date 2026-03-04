export type NoiseLabel = 'Silent' | 'Quiet' | 'Vibrant';
export type TablesLabel = 'Limited' | 'Mixed' | 'Ideal';
export type OutletsLabel = 'None' | 'Limited' | 'Ample';

export interface FeedItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  noise: NoiseLabel | null;
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
}

export type FeedFilter = '' | 'quiet' | 'free' | 'libraries' | 'open_late';

export const FEED_FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: '', label: 'All spots' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'free', label: 'Free' },
  { value: 'libraries', label: 'Libraries' },
  { value: 'open_late', label: 'Open late' },
];
