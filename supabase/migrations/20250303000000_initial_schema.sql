-- Initial schema: enums, tables, RLS, place_stats trigger
-- Runs before get_feed_places migration.

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE noise_level AS ENUM ('silent', 'quiet', 'vibrant');

CREATE TYPE tables_label AS ENUM ('limited', 'mixed', 'ideal');

CREATE TYPE outlets_label AS ENUM ('none', 'limited', 'ample');

-- Vibe on ratings: focus, mixed, social only
CREATE TYPE vibe AS ENUM ('focus', 'mixed', 'social');

-- Vibe preference on user_preferences: includes 'any'
CREATE TYPE vibe_preference AS ENUM ('focus', 'mixed', 'social', 'any');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Profiles: one row per user (auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User preferences: radius, noise, outlets, wifi, vibe
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  radius_miles numeric NOT NULL,
  noise_preference vibe_preference NOT NULL,
  needs_outlets boolean NOT NULL DEFAULT false,
  needs_wifi boolean NOT NULL DEFAULT false,
  vibe_preference vibe_preference NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Places: venues (cafes, libraries)
CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,
  name text NOT NULL,
  address text NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  place_type text NOT NULL,
  google_photo_ref text,
  google_photo_attribution text,
  opening_hours jsonb,
  timezone text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Place stats: cached aggregates per place (1:1 with places)
CREATE TABLE place_stats (
  place_id uuid PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  rating_count integer NOT NULL DEFAULT 0,
  noise_silent integer NOT NULL DEFAULT 0,
  noise_quiet integer NOT NULL DEFAULT 0,
  noise_vibrant integer NOT NULL DEFAULT 0,
  tables_limited integer NOT NULL DEFAULT 0,
  tables_mixed integer NOT NULL DEFAULT 0,
  tables_ideal integer NOT NULL DEFAULT 0,
  outlets_none integer NOT NULL DEFAULT 0,
  outlets_limited integer NOT NULL DEFAULT 0,
  outlets_ample integer NOT NULL DEFAULT 0,
  avg_wifi numeric,
  vibe_focus integer NOT NULL DEFAULT 0,
  vibe_mixed integer NOT NULL DEFAULT 0,
  vibe_social integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ratings: one per user per place (upsert)
CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  noise noise_level NOT NULL,
  tables_label tables_label NOT NULL,
  outlets_label outlets_label NOT NULL,
  wifi_rating smallint CHECK (wifi_rating IS NULL OR (wifi_rating >= 1 AND wifi_rating <= 5)),
  vibe vibe,
  pills text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);

-- Pills: fixed allowed set (enforced in app + check constraint)
ALTER TABLE ratings
ADD CONSTRAINT ratings_pills_valid
CHECK (
  pills <@ ARRAY[
    'study rooms', 'public computers', 'morning rush', 'cozy nooks',
    'outdoor seating', 'good lighting', 'fast wifi', 'standing desks',
    'wheelchair accessible', 'kid friendly', 'dog friendly',
    'late night', 'group friendly', 'solo friendly'
  ]::text[]
);

-- Favorites: user–place saves
CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Profiles: own row only
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);

-- User preferences: own row only
CREATE POLICY user_preferences_select_own ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_preferences_insert_own ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_preferences_update_own ON user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Places: all authenticated can read; insert/update via service role only (no policy = blocked for authenticated)
CREATE POLICY places_select_authenticated ON places FOR SELECT TO authenticated USING (true);

-- Place stats: all authenticated can read; insert/update via trigger/service role only
CREATE POLICY place_stats_select_authenticated ON place_stats FOR SELECT TO authenticated USING (true);

-- Ratings: all authenticated can read; own row for insert/update/delete
CREATE POLICY ratings_select_authenticated ON ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY ratings_insert_own ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ratings_update_own ON ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ratings_delete_own ON ratings FOR DELETE USING (auth.uid() = user_id);

-- Favorites: own rows only; read/insert/delete (no update)
CREATE POLICY favorites_select_own ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY favorites_insert_own ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY favorites_delete_own ON favorites FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- TRIGGER: create empty place_stats row when a place is created
-- =============================================================================

CREATE OR REPLACE FUNCTION create_place_stats_on_place_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

CREATE TRIGGER trigger_create_place_stats
  AFTER INSERT ON places
  FOR EACH ROW
  EXECUTE FUNCTION create_place_stats_on_place_insert();

-- =============================================================================
-- TRIGGER: recompute place_stats on ratings INSERT/UPDATE/DELETE
-- =============================================================================

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
    COUNT(*) FILTER (WHERE tables_label = 'limited')::integer,
    COUNT(*) FILTER (WHERE tables_label = 'mixed')::integer,
    COUNT(*) FILTER (WHERE tables_label = 'ideal')::integer,
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

CREATE TRIGGER trigger_update_place_stats
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_place_stats();
