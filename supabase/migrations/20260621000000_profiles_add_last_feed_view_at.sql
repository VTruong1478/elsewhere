-- Track when each user last viewed their social feed.
-- Used to compute the recency window for the "caught up" cutoff.
-- NULL means the user has never viewed the feed (treated as 7-day fallback in app code).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_feed_view_at timestamptz;
