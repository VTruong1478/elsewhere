-- Second transaction: use new enum values (place_stats, trigger, backfill).
-- Depends on 20250305000000_tables_level_none_limited_ample.sql (enum values added there).

-- Step 2: Add tables_none to place_stats so we can count 'none' ratings.
ALTER TABLE place_stats
  ADD COLUMN IF NOT EXISTS tables_none integer NOT NULL DEFAULT 0;

-- Step 3: Update the place_stats trigger to count none / limited (limited+mixed) / ample (ideal+ample).
CREATE OR REPLACE FUNCTION update_place_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_place_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_place_id := OLD.place_id;
  ELSE
    target_place_id := NEW.place_id;
  END IF;

  INSERT INTO place_stats (
    place_id,
    rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed, tables_ideal,
    tables_none,
    outlets_none, outlets_limited, outlets_ample,
    vibe_focus, vibe_mixed, vibe_social,
    avg_wifi,
    updated_at
  )
  SELECT
    target_place_id,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE noise = 'silent')::integer,
    COUNT(*) FILTER (WHERE noise = 'quiet')::integer,
    COUNT(*) FILTER (WHERE noise = 'vibrant')::integer,
    COUNT(*) FILTER (WHERE tables_label IN ('limited', 'mixed'))::integer,
    COUNT(*) FILTER (WHERE tables_label = 'mixed')::integer,
    COUNT(*) FILTER (WHERE tables_label IN ('ideal', 'ample'))::integer,
    COUNT(*) FILTER (WHERE tables_label = 'none')::integer,
    COUNT(*) FILTER (WHERE outlets_label = 'none')::integer,
    COUNT(*) FILTER (WHERE outlets_label = 'limited')::integer,
    COUNT(*) FILTER (WHERE outlets_label = 'ample')::integer,
    COUNT(*) FILTER (WHERE vibe = 'focus')::integer,
    COUNT(*) FILTER (WHERE vibe = 'mixed')::integer,
    COUNT(*) FILTER (WHERE vibe = 'social')::integer,
    AVG(wifi_rating),
    now()
  FROM ratings
  WHERE place_id = target_place_id
  ON CONFLICT (place_id) DO UPDATE SET
    rating_count = EXCLUDED.rating_count,
    noise_silent = EXCLUDED.noise_silent,
    noise_quiet = EXCLUDED.noise_quiet,
    noise_vibrant = EXCLUDED.noise_vibrant,
    tables_limited = EXCLUDED.tables_limited,
    tables_mixed = EXCLUDED.tables_mixed,
    tables_ideal = EXCLUDED.tables_ideal,
    tables_none = EXCLUDED.tables_none,
    outlets_none = EXCLUDED.outlets_none,
    outlets_limited = EXCLUDED.outlets_limited,
    outlets_ample = EXCLUDED.outlets_ample,
    vibe_focus = EXCLUDED.vibe_focus,
    vibe_mixed = EXCLUDED.vibe_mixed,
    vibe_social = EXCLUDED.vibe_social,
    avg_wifi = EXCLUDED.avg_wifi,
    updated_at = EXCLUDED.updated_at;

  RETURN NULL;
END;
$$;

-- Backfill tables_none for existing place_stats (trigger only runs on rating change).
UPDATE place_stats ps
SET tables_none = COALESCE((
  SELECT COUNT(*)::integer FROM ratings r
  WHERE r.place_id = ps.place_id AND r.tables_label = 'none'
), 0);
