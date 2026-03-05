-- Expose vibe_photo_ref and vibe_photo_attribution from places in get_feed_places.
DROP FUNCTION IF EXISTS get_feed_places(double precision, double precision, double precision, text, text);

CREATE OR REPLACE FUNCTION get_feed_places(
  user_lat double precision,
  user_lng double precision,
  radius_miles double precision,
  search_q text DEFAULT NULL,
  filter_chip text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  lat numeric,
  lng numeric,
  place_type text,
  google_photo_ref text,
  google_photo_attribution text,
  vibe_photo_ref text,
  vibe_photo_attribution jsonb,
  opening_hours jsonb,
  timezone text,
  rating_count bigint,
  noise_silent bigint,
  noise_quiet bigint,
  noise_vibrant bigint,
  tables_limited bigint,
  tables_mixed bigint,
  tables_ideal bigint,
  tables_none bigint,
  outlets_none bigint,
  outlets_limited bigint,
  outlets_ample bigint,
  place_noise_level text,
  place_tables_level text,
  place_outlets_level text,
  avg_wifi numeric,
  vibe_focus bigint,
  vibe_mixed bigint,
  vibe_social bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.address,
    p.lat,
    p.lng,
    p.place_type,
    p.google_photo_ref,
    p.google_photo_attribution,
    p.vibe_photo_ref,
    p.vibe_photo_attribution,
    p.opening_hours,
    p.timezone,
    COALESCE(ps.rating_count, 0)::bigint,
    COALESCE(ps.noise_silent, 0)::bigint,
    COALESCE(ps.noise_quiet, 0)::bigint,
    COALESCE(ps.noise_vibrant, 0)::bigint,
    COALESCE(ps.tables_limited, 0)::bigint,
    COALESCE(ps.tables_mixed, 0)::bigint,
    COALESCE(ps.tables_ideal, 0)::bigint,
    COALESCE(ps.tables_none, 0)::bigint,
    COALESCE(ps.outlets_none, 0)::bigint,
    COALESCE(ps.outlets_limited, 0)::bigint,
    COALESCE(ps.outlets_ample, 0)::bigint,
    p.noise_level::text,
    p.tables_level::text,
    p.outlets_level::text,
    ps.avg_wifi,
    COALESCE(ps.vibe_focus, 0)::bigint,
    COALESCE(ps.vibe_mixed, 0)::bigint,
    COALESCE(ps.vibe_social, 0)::bigint
  FROM places p
  LEFT JOIN place_stats ps ON ps.place_id = p.id
  WHERE
    earth_distance(
      ll_to_earth(p.lat::float8, p.lng::float8),
      ll_to_earth(user_lat, user_lng)
    ) <= (radius_miles * 1609.344)
    AND (
      search_q IS NULL OR search_q = ''
      OR p.name ILIKE '%' || search_q || '%'
      OR p.address ILIKE '%' || search_q || '%'
    )
    AND (
      filter_chip IS NULL OR filter_chip = ''
      OR (filter_chip = 'quiet' AND COALESCE(ps.noise_quiet, 0) >= COALESCE(ps.noise_silent, 0) AND COALESCE(ps.noise_quiet, 0) >= COALESCE(ps.noise_vibrant, 0) AND COALESCE(ps.noise_quiet, 0) > 0)
      OR (filter_chip = 'free' AND p.place_type = 'library')
      OR (filter_chip = 'libraries' AND p.place_type = 'library')
      OR (filter_chip = 'open_late' AND p.opening_hours IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.opening_hours->'periods') AS period
        WHERE (period->'close'->>'time') IS NOT NULL AND (period->'close'->>'time')::text >= '2200'
      ))
    )
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION get_feed_places(double precision, double precision, double precision, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_feed_places(double precision, double precision, double precision, text, text) TO anon;
