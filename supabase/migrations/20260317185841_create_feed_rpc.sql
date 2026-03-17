CREATE OR REPLACE FUNCTION public.get_feed_places(
  user_lat     numeric,
  user_lng     numeric,
  radius_miles numeric,
  search_q     text,
  filter_chip  text
)
RETURNS TABLE (
  id                uuid,
  google_place_id   text,
  name              text,
  address           text,
  lat               numeric,
  lng               numeric,
  place_type        text,
  has_wifi          boolean,
  google_photo_ref  text,
  opening_hours     jsonb,
  timezone          text,
  is_active         boolean,
  created_by        uuid,
  created_at        timestamptz,
  updated_at        timestamptz,
  place_id          uuid,
  rating_count      integer,
  noise_silent      integer,
  noise_quiet       integer,
  noise_vibrant     integer,
  tables_limited    integer,
  tables_mixed      integer,
  tables_plentiful  integer,
  outlets_scarce    integer,
  outlets_some      integer,
  outlets_ample     integer,
  vibe_focused      integer,
  vibe_casual       integer,
  vibe_social       integer,
  avg_overall_rating numeric,
  stats_updated_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    p.google_place_id,
    p.name,
    p.address,
    p.lat,
    p.lng,
    p.place_type,
    p.has_wifi,
    p.google_photo_ref,
    p.opening_hours,
    p.timezone,
    p.is_active,
    p.created_by,
    p.created_at,
    p.updated_at,
    ps.place_id,
    ps.rating_count,
    ps.noise_silent,
    ps.noise_quiet,
    ps.noise_vibrant,
    ps.tables_limited,
    ps.tables_mixed,
    ps.tables_plentiful,
    ps.outlets_scarce,
    ps.outlets_some,
    ps.outlets_ample,
    ps.vibe_focused,
    ps.vibe_casual,
    ps.vibe_social,
    ps.avg_overall_rating,
    ps.updated_at AS stats_updated_at
  FROM public.places AS p
  JOIN public.place_stats AS ps
    ON ps.place_id = p.id
  WHERE
    p.is_active = TRUE
    AND earth_distance(
          ll_to_earth(user_lat, user_lng),
          ll_to_earth(p.lat, p.lng)
        ) <= (radius_miles * 1609.344)
    AND (
      search_q IS NULL
      OR search_q = ''
      OR p.name ILIKE '%' || search_q || '%'
      OR p.address ILIKE '%' || search_q || '%'
    )
    AND (
      filter_chip IS NULL
      OR filter_chip = ''
      OR (filter_chip = 'cafes' AND p.place_type = 'cafe')
      OR (filter_chip = 'libraries' AND p.place_type = 'library')
      OR (filter_chip NOT IN ('cafes', 'libraries'))
    );
$$;
