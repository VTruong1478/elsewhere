-- WiFi and bathroom as optional rating attributes.
--
-- `places.has_wifi` was null for every place and nothing ever wrote it, so the
-- single most-requested work attribute was uncollectable. These two columns are
-- collected per rating (like noise/tables/outlets/vibe) and aggregated into
-- place_stats by the existing trigger, so "what do people say about the wifi
-- here" becomes answerable the same way every other attribute already is.
--
-- Both are NULLABLE on purpose: the questions are optional in the rating form,
-- and a NULL means "this rater did not say", which is what leaves a place in the
-- unknown state on the place card. There is deliberately no 'unknown' enum
-- value — absence already carries that meaning, and storing it as a value would
-- put non-answers into the aggregate.
--
-- New types (not ALTER TYPE ... ADD VALUE), so this can safely be one migration:
-- the two-file split in 20250305000000/20250305000001 is only required when
-- adding values to an existing enum.

-- Bathroom is a friction ladder, least first. There is intentionally no
-- "customers only": that is a policy, while the rest of the ladder is about a
-- physical barrier, and mixing the two dimensions made the options overlap.
-- Postgres has no CREATE TYPE IF NOT EXISTS, so guard for re-runs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wifi_level') THEN
    CREATE TYPE public.wifi_level AS ENUM ('none', 'works', 'fast');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bathroom_access') THEN
    CREATE TYPE public.bathroom_access AS ENUM ('open', 'key', 'none');
  END IF;
END
$$;

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS wifi public.wifi_level,
  ADD COLUMN IF NOT EXISTS bathroom public.bathroom_access;

COMMENT ON COLUMN public.ratings.wifi IS
  'Optional. none = no usable free wifi, works = fine for ordinary work, fast = holds video calls. NULL = rater did not say.';
COMMENT ON COLUMN public.ratings.bathroom IS
  'Optional. open = walk in, key = must ask for a key or code, none = no bathroom. NULL = rater did not say.';

ALTER TABLE public.place_stats
  ADD COLUMN IF NOT EXISTS wifi_none integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wifi_works integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wifi_fast integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bathroom_open integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bathroom_key integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bathroom_none integer DEFAULT 0;

-- Full body restated from 20260415170000_update_place_stats_skip_missing_place.sql
-- (the latest authoritative version — schema-dev.sql's copy is stale and lacks
-- both the missing-place guard and the pinned search_path) with the six new
-- counts added to the INSERT list, the SELECT and the DO UPDATE SET.
CREATE OR REPLACE FUNCTION public.update_place_stats() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_place_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_place_id := OLD.place_id;
  ELSE
    target_place_id := NEW.place_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.places WHERE id = target_place_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.place_stats (
    place_id, rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed, tables_plentiful,
    outlets_scarce, outlets_some, outlets_ample,
    vibe_focused, vibe_casual, vibe_social,
    wifi_none, wifi_works, wifi_fast,
    bathroom_open, bathroom_key, bathroom_none,
    avg_overall_rating, updated_at
  )
  SELECT
    target_place_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE noise = 'silent'),
    COUNT(*) FILTER (WHERE noise = 'quiet'),
    COUNT(*) FILTER (WHERE noise = 'vibrant'),
    COUNT(*) FILTER (WHERE tables = 'limited'),
    COUNT(*) FILTER (WHERE tables = 'mixed'),
    COUNT(*) FILTER (WHERE tables = 'plentiful'),
    COUNT(*) FILTER (WHERE outlets = 'scarce'),
    COUNT(*) FILTER (WHERE outlets = 'some'),
    COUNT(*) FILTER (WHERE outlets = 'ample'),
    COUNT(*) FILTER (WHERE vibe = 'focused'),
    COUNT(*) FILTER (WHERE vibe = 'casual'),
    COUNT(*) FILTER (WHERE vibe = 'social'),
    COUNT(*) FILTER (WHERE wifi = 'none'),
    COUNT(*) FILTER (WHERE wifi = 'works'),
    COUNT(*) FILTER (WHERE wifi = 'fast'),
    COUNT(*) FILTER (WHERE bathroom = 'open'),
    COUNT(*) FILTER (WHERE bathroom = 'key'),
    COUNT(*) FILTER (WHERE bathroom = 'none'),
    AVG(overall_rating),
    now()
  FROM public.ratings
  WHERE place_id = target_place_id
  ON CONFLICT (place_id) DO UPDATE SET
    rating_count       = EXCLUDED.rating_count,
    noise_silent       = EXCLUDED.noise_silent,
    noise_quiet        = EXCLUDED.noise_quiet,
    noise_vibrant      = EXCLUDED.noise_vibrant,
    tables_limited     = EXCLUDED.tables_limited,
    tables_mixed       = EXCLUDED.tables_mixed,
    tables_plentiful   = EXCLUDED.tables_plentiful,
    outlets_scarce     = EXCLUDED.outlets_scarce,
    outlets_some       = EXCLUDED.outlets_some,
    outlets_ample      = EXCLUDED.outlets_ample,
    vibe_focused       = EXCLUDED.vibe_focused,
    vibe_casual        = EXCLUDED.vibe_casual,
    vibe_social        = EXCLUDED.vibe_social,
    wifi_none          = EXCLUDED.wifi_none,
    wifi_works         = EXCLUDED.wifi_works,
    wifi_fast          = EXCLUDED.wifi_fast,
    bathroom_open      = EXCLUDED.bathroom_open,
    bathroom_key       = EXCLUDED.bathroom_key,
    bathroom_none      = EXCLUDED.bathroom_none,
    avg_overall_rating = EXCLUDED.avg_overall_rating,
    updated_at         = now();

  RETURN NULL;
END;
$$;

-- Seed row for a newly inserted place: same shape, six more zeros.
CREATE OR REPLACE FUNCTION public.create_place_stats_on_place_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO place_stats (
    place_id,
    rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed,
    outlets_ample, vibe_social,
    updated_at,
    vibe_focused, vibe_casual,
    tables_plentiful, outlets_scarce, outlets_some,
    wifi_none, wifi_works, wifi_fast,
    bathroom_open, bathroom_key, bathroom_none,
    avg_overall_rating
  ) VALUES (
    NEW.id,
    0,
    0, 0, 0,
    0, 0,
    0, 0,
    now(),
    0, 0,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    NULL
  )
  ON CONFLICT (place_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill: the trigger only fires on a rating write, so existing place_stats
-- rows would otherwise keep NULL in the new columns until someone re-rates.
-- Every existing rating has NULL wifi/bathroom, so these all resolve to 0 —
-- but the UPDATE makes that explicit rather than leaving NULLs that the API
-- would have to coerce.
UPDATE public.place_stats ps
SET
  wifi_none     = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.wifi = 'none'), 0),
  wifi_works    = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.wifi = 'works'), 0),
  wifi_fast     = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.wifi = 'fast'), 0),
  bathroom_open = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.bathroom = 'open'), 0),
  bathroom_key  = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.bathroom = 'key'), 0),
  bathroom_none = COALESCE((SELECT COUNT(*)::integer FROM public.ratings r WHERE r.place_id = ps.place_id AND r.bathroom = 'none'), 0);
