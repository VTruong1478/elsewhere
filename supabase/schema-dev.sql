--
-- PostgreSQL database dump
--

\restrict FUdTmC5bjciwFVIkhy5cacdBXFnme4mEkptxOvoPz4bXPsRKCW2q5ZFNL9eYnic

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: noise_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.noise_level AS ENUM (
    'silent',
    'quiet',
    'vibrant'
);


--
-- Name: outlets_label; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.outlets_label AS ENUM (
    'none',
    'limited',
    'ample',
    'scarce',
    'some'
);


--
-- Name: place_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.place_type AS ENUM (
    'cafe',
    'library',
    'bookstore'
);


--
-- Name: tables_label; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tables_label AS ENUM (
    'limited',
    'mixed',
    'ideal',
    'none',
    'ample',
    'plentiful'
);


--
-- Name: tables_level_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tables_level_enum AS ENUM (
    'limited',
    'mixed',
    'ideal'
);


--
-- Name: vibe; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vibe AS ENUM (
    'focus',
    'mixed',
    'social'
);


--
-- Name: vibe_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vibe_level AS ENUM (
    'focused',
    'casual',
    'social'
);


--
-- Name: vibe_preference; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vibe_preference AS ENUM (
    'focus',
    'mixed',
    'social',
    'any'
);


--
-- Name: create_place_stats_on_place_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_place_stats_on_place_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO place_stats (
    place_id,
    rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed, tables_ideal,
    outlets_none, outlets_limited, outlets_ample,
    vibe_focus, vibe_mixed, vibe_social,
    updated_at
  ) VALUES (
    NEW.id,
    0,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    now()
  )
  ON CONFLICT (place_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: get_feed_places(numeric, numeric, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feed_places(user_lat numeric, user_lng numeric, radius_miles numeric, search_q text, filter_chip text) RETURNS TABLE(id uuid, google_place_id text, name text, address text, lat numeric, lng numeric, place_type public.place_type, has_wifi boolean, google_photo_ref text, opening_hours jsonb, timezone text, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, place_id uuid, rating_count integer, noise_silent integer, noise_quiet integer, noise_vibrant integer, tables_limited integer, tables_mixed integer, tables_plentiful integer, outlets_scarce integer, outlets_some integer, outlets_ample integer, vibe_focused integer, vibe_casual integer, vibe_social integer, avg_overall_rating numeric, stats_updated_at timestamp with time zone)
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_place_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_place_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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
  FROM ratings
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    user_id uuid NOT NULL,
    place_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name text,
    avatar_url text
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    user_id uuid NOT NULL,
    noise public.noise_level NOT NULL,
    tables public.tables_label NOT NULL,
    outlets public.outlets_label NOT NULL,
    vibe public.vibe_level,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    overall_rating numeric(3,1),
    photo_path text,
    is_hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT ratings_notes_length CHECK ((char_length(notes) <= 500)),
    CONSTRAINT ratings_notes_length_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT ratings_overall_rating_check CHECK (((overall_rating >= (0)::numeric) AND (overall_rating <= (5)::numeric))),
    CONSTRAINT ratings_overall_rating_check1 CHECK (((overall_rating * (2)::numeric) = floor((overall_rating * (2)::numeric))))
);


--
-- Name: place_notes_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.place_notes_public AS
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


--
-- Name: place_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_stats (
    place_id uuid NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    noise_silent integer DEFAULT 0 NOT NULL,
    noise_quiet integer DEFAULT 0 NOT NULL,
    noise_vibrant integer DEFAULT 0 NOT NULL,
    tables_limited integer DEFAULT 0 NOT NULL,
    tables_mixed integer DEFAULT 0 NOT NULL,
    outlets_ample integer DEFAULT 0 NOT NULL,
    vibe_social integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vibe_focused integer DEFAULT 0,
    vibe_casual integer DEFAULT 0,
    tables_plentiful integer DEFAULT 0,
    outlets_scarce integer DEFAULT 0,
    outlets_some integer DEFAULT 0,
    avg_overall_rating numeric
);


--
-- Name: place_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_submissions (
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


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    google_place_id text,
    name text NOT NULL,
    address text NOT NULL,
    lat numeric NOT NULL,
    lng numeric NOT NULL,
    place_type public.place_type NOT NULL,
    google_photo_ref text,
    opening_hours jsonb,
    timezone text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    has_wifi boolean,
    is_active boolean DEFAULT true NOT NULL,
    vibe_photo_path text
);


--
-- Name: saved; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved (
    user_id uuid NOT NULL,
    place_id uuid NOT NULL,
    saved_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    radius_miles numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (user_id, place_id);


--
-- Name: place_stats place_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_stats
    ADD CONSTRAINT place_stats_pkey PRIMARY KEY (place_id);


--
-- Name: place_submissions place_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_submissions
    ADD CONSTRAINT place_submissions_pkey PRIMARY KEY (id);


--
-- Name: places places_google_place_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_google_place_id_key UNIQUE (google_place_id);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_place_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_place_id_user_id_key UNIQUE (place_id, user_id);


--
-- Name: saved saved_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved
    ADD CONSTRAINT saved_pkey PRIMARY KEY (user_id, place_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: place_submissions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX place_submissions_created_at_idx ON public.place_submissions USING btree (created_at DESC);


--
-- Name: place_submissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX place_submissions_status_idx ON public.place_submissions USING btree (status);


--
-- Name: place_submissions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX place_submissions_user_id_idx ON public.place_submissions USING btree (user_id);


--
-- Name: places_google_place_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX places_google_place_id_unique ON public.places USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);


--
-- Name: ratings ratings_update_place_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ratings_update_place_stats AFTER INSERT OR DELETE OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_place_stats();


--
-- Name: place_submissions trg_place_submissions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_place_submissions_set_updated_at BEFORE UPDATE ON public.place_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: places trigger_create_place_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_place_stats AFTER INSERT ON public.places FOR EACH ROW EXECUTE FUNCTION public.create_place_stats_on_place_insert();


--
-- Name: ratings trigger_update_place_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_place_stats AFTER INSERT OR DELETE OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_place_stats();


--
-- Name: favorites favorites_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: place_stats place_stats_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_stats
    ADD CONSTRAINT place_stats_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: place_submissions place_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_submissions
    ADD CONSTRAINT place_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: places places_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: saved saved_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved
    ADD CONSTRAINT saved_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE RESTRICT;


--
-- Name: saved saved_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved
    ADD CONSTRAINT saved_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: place_stats anon_read_place_stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_place_stats ON public.place_stats FOR SELECT TO anon USING (true);


--
-- Name: places anon_read_places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_places ON public.places FOR SELECT TO anon USING (true);


--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_delete_own ON public.favorites FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: favorites favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_insert_own ON public.favorites FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: favorites favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_select_own ON public.favorites FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: place_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.place_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: place_stats place_stats_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY place_stats_select_authenticated ON public.place_stats FOR SELECT TO authenticated USING (true);


--
-- Name: place_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.place_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: place_submissions place_submissions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY place_submissions_insert_own ON public.place_submissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: place_submissions place_submissions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY place_submissions_select_own ON public.place_submissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: place_submissions place_submissions_update_own_when_new; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY place_submissions_update_own_when_new ON public.place_submissions FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (status = 'new'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'new'::text)));


--
-- Name: places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

--
-- Name: places places_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY places_select_authenticated ON public.places FOR SELECT TO authenticated USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: ratings ratings_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ratings_delete_own ON public.ratings FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: ratings ratings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ratings_insert_own ON public.ratings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ratings ratings_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ratings_select_authenticated ON public.ratings FOR SELECT TO authenticated USING (true);


--
-- Name: ratings ratings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ratings_update_own ON public.ratings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: saved; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved ENABLE ROW LEVEL SECURITY;

--
-- Name: saved saved: own rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "saved: own rows" ON public.saved USING ((auth.uid() = user_id));


--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences user_preferences_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_preferences_insert_own ON public.user_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_preferences user_preferences_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_preferences_select_own ON public.user_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_preferences user_preferences_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_preferences_update_own ON public.user_preferences FOR UPDATE USING ((auth.uid() = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict FUdTmC5bjciwFVIkhy5cacdBXFnme4mEkptxOvoPz4bXPsRKCW2q5ZFNL9eYnic

