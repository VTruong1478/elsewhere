-- migrate-prod.sql — additive migration toward schema-dev.sql (local dev) parity.
-- Generated from diff(schema-prod.sql, schema-dev.sql). Review before running on production.
-- Does not DROP objects. Uses CREATE OR REPLACE / IF NOT EXISTS / guarded DO blocks where needed.
--
-- Prereqs: all existing places.place_type values must be cafe | library | bookstore.
-- Vibe values on ratings are mapped: focus→focused, mixed→casual, social→social.

-- ---------------------------------------------------------------------------
-- 1) New enum types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.place_type AS ENUM ('cafe', 'library', 'bookstore');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tables_level_enum AS ENUM ('limited', 'mixed', 'ideal');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.vibe_level AS ENUM ('focused', 'casual', 'social');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Extend existing enums (outlets_label, tables_label)
-- ---------------------------------------------------------------------------
ALTER TYPE public.outlets_label ADD VALUE IF NOT EXISTS 'scarce';
ALTER TYPE public.outlets_label ADD VALUE IF NOT EXISTS 'some';

ALTER TYPE public.tables_label ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE public.tables_label ADD VALUE IF NOT EXISTS 'ample';
ALTER TYPE public.tables_label ADD VALUE IF NOT EXISTS 'plentiful';

-- ---------------------------------------------------------------------------
-- 3) places: new column + place_type as enum
-- ---------------------------------------------------------------------------
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS vibe_photo_path text;

ALTER TABLE public.places
  ALTER COLUMN place_type TYPE public.place_type
  USING place_type::text::public.place_type;

-- ---------------------------------------------------------------------------
-- 4) place_submissions (missing on prod)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.place_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    place_name text NOT NULL,
    address_or_location text NOT NULL,
    place_type text NOT NULL,
    submitted_from_search text,
    status text DEFAULT 'new'::text NOT NULL,
    reviewer_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT place_submissions_address_not_blank CHECK ((btrim(address_or_location) <> ''::text)),
    CONSTRAINT place_submissions_place_name_not_blank CHECK ((btrim(place_name) <> ''::text)),
    CONSTRAINT place_submissions_place_type_not_blank CHECK ((btrim(place_type) <> ''::text)),
    CONSTRAINT place_submissions_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text, 'added'::text])))
);

DO $$ BEGIN
  ALTER TABLE ONLY public.place_submissions
    ADD CONSTRAINT place_submissions_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.place_submissions
    ADD CONSTRAINT place_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5) ratings: is_hidden + CHECKs; vibe → vibe_level
-- ---------------------------------------------------------------------------
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_notes_length CHECK ((char_length(notes) <= 500));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_overall_rating_check CHECK (((overall_rating >= (0)::numeric) AND (overall_rating <= (5)::numeric)));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_overall_rating_half_step CHECK (((overall_rating * (2)::numeric) = floor((overall_rating * (2)::numeric))));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.ratings
  ALTER COLUMN vibe TYPE public.vibe_level
  USING (
    CASE vibe::text
      WHEN 'focus' THEN 'focused'::public.vibe_level
      WHEN 'mixed' THEN 'casual'::public.vibe_level
      WHEN 'social' THEN 'social'::public.vibe_level
      ELSE NULL
    END
  );

-- ---------------------------------------------------------------------------
-- 6) Functions (align with dev; create_place_stats matches real place_stats columns)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_place_stats_on_place_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.place_stats (place_id)
  VALUES (NEW.id)
  ON CONFLICT (place_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_place_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.get_feed_places(
  user_lat numeric, user_lng numeric, radius_miles numeric, search_q text, filter_chip text
) RETURNS TABLE(
  id uuid, google_place_id text, name text, address text, lat numeric, lng numeric,
  place_type public.place_type, has_wifi boolean, google_photo_ref text, opening_hours jsonb,
  timezone text, is_active boolean, created_by uuid, created_at timestamp with time zone,
  updated_at timestamp with time zone, place_id uuid, rating_count integer,
  noise_silent integer, noise_quiet integer, noise_vibrant integer,
  tables_limited integer, tables_mixed integer, tables_plentiful integer,
  outlets_scarce integer, outlets_some integer, outlets_ample integer,
  vibe_focused integer, vibe_casual integer, vibe_social integer,
  avg_overall_rating numeric, stats_updated_at timestamp with time zone
)
    LANGUAGE sql STABLE
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
  JOIN public.place_stats AS ps ON ps.place_id = p.id
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

-- ---------------------------------------------------------------------------
-- 7) View (depends on ratings + profiles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.place_notes_public AS
 SELECT r.place_id,
    r.id AS rating_id,
    r.notes,
    r.updated_at AS created_at,
        CASE
            WHEN ((p.full_name IS NULL) OR (btrim(p.full_name) = ''::text)) THEN 'Anonymous'::text
            WHEN (strpos(btrim(p.full_name), ' '::text) = 0) THEN btrim(p.full_name)
            ELSE (((split_part(btrim(p.full_name), ' '::text, 1) || ' '::text) || "left"(split_part(btrim(p.full_name), ' '::text, array_length(string_to_array(btrim(p.full_name), ' '::text), 1)), 1)) || '.'::text)
        END AS author_short_name
   FROM (public.ratings r
     JOIN public.profiles p ON ((p.id = r.user_id)))
  WHERE ((r.notes IS NOT NULL) AND (btrim(r.notes) <> ''::text) AND (r.is_hidden = false));

-- ---------------------------------------------------------------------------
-- 8) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS place_submissions_created_at_idx ON public.place_submissions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS place_submissions_status_idx ON public.place_submissions USING btree (status);
CREATE INDEX IF NOT EXISTS place_submissions_user_id_idx ON public.place_submissions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS places_google_place_id_unique ON public.places USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 9) Triggers
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TRIGGER ratings_update_place_stats
    AFTER INSERT OR DELETE OR UPDATE ON public.ratings
    FOR EACH ROW EXECUTE FUNCTION public.update_place_stats();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_place_submissions_set_updated_at
    BEFORE UPDATE ON public.place_submissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 10) RLS policies (idempotent create)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY anon_read_place_stats ON public.place_stats FOR SELECT TO anon USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY anon_read_places ON public.places FOR SELECT TO anon USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.place_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY place_submissions_insert_own ON public.place_submissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY place_submissions_select_own ON public.place_submissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY place_submissions_update_own_when_new ON public.place_submissions FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (status = 'new'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'new'::text)));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "saved: own rows" ON public.saved USING ((auth.uid() = user_id));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
