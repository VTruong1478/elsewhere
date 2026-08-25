-- Remove two pieces of dead weight found during the wifi/bathroom pass.
--
-- 1. `places.has_wifi` is superseded. WiFi is now collected per rating
--    (ratings.wifi) and aggregated into place_stats by the trigger, so the
--    boolean column is redundant. It is also null on every row — verified 0 of
--    126 non-null before dropping — so nothing is lost.
--
--    Dropping it forces `get_feed_places` to be recreated: the column appears
--    in that function's RETURNS TABLE signature, and Postgres cannot
--    CREATE OR REPLACE a function whose OUT-parameter list changes. The body
--    below is the live definition with `has_wifi` removed from the signature
--    and the SELECT, and nothing else touched. DROP FUNCTION must come first,
--    which is why the column drop is sequenced after it.
--
-- 2. `ratings` carried two triggers running the same update_place_stats()
--    function, so the full-table recompute ran twice on every rating write —
--    now more expensive with six extra COUNT(*) FILTER clauses.
--    `trigger_update_place_stats` is the one created by
--    20250303000000_initial_schema.sql and is kept;
--    `ratings_update_place_stats` appears only in the schema dump (created
--    ad-hoc, never in a migration) and is the one dropped.

-- 1a. Recreate the feed RPC without has_wifi.
DROP FUNCTION IF EXISTS public.get_feed_places(numeric, numeric, numeric, text, text);

CREATE FUNCTION public.get_feed_places(user_lat numeric, user_lng numeric, radius_miles numeric, search_q text, filter_chip text)
 RETURNS TABLE(id uuid, google_place_id text, name text, address text, lat numeric, lng numeric, place_type place_type, google_photo_ref text, opening_hours jsonb, timezone text, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, place_id uuid, rating_count integer, noise_silent integer, noise_quiet integer, noise_vibrant integer, tables_limited integer, tables_mixed integer, tables_plentiful integer, outlets_scarce integer, outlets_some integer, outlets_ample integer, vibe_focused integer, vibe_casual integer, vibe_social integer, avg_overall_rating numeric, stats_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.google_place_id,
    p.name,
    p.address,
    p.lat,
    p.lng,
    p.place_type,
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
      OR (filter_chip = 'bookstores' AND p.place_type = 'bookstore'::public.place_type)
      OR (filter_chip = 'tea_shops' AND p.place_type = 'tea_shop'::public.place_type)
      OR (filter_chip NOT IN ('cafes', 'libraries', 'bookstores', 'tea_shops'))
    );
$function$;

-- Grants are not preserved across DROP FUNCTION; restore them.
GRANT EXECUTE ON FUNCTION public.get_feed_places(numeric, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feed_places(numeric, numeric, numeric, text, text) TO anon;

-- 1b. Now the column has no dependents.
ALTER TABLE public.places DROP COLUMN IF EXISTS has_wifi;

-- 2. Drop the duplicate trigger, keeping the one from the initial schema.
DROP TRIGGER IF EXISTS ratings_update_place_stats ON public.ratings;
