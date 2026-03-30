-- Fixes functions that still referenced place_stats.tables_ideal (use tables_plentiful).
-- Run in Supabase SQL Editor, or seed-places.ts applies this when it can connect (DATABASE_URL or SUPABASE_DB_PASSWORD).

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
    NULL
  )
  ON CONFLICT (place_id) DO NOTHING;
  RETURN NEW;
END;
$$;

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

  INSERT INTO public.place_stats (
    place_id, rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed, tables_plentiful,
    outlets_scarce, outlets_some, outlets_ample,
    vibe_focused, vibe_casual, vibe_social,
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
    avg_overall_rating = EXCLUDED.avg_overall_rating,
    updated_at         = now();

  RETURN NULL;
END;
$$;
