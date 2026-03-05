-- Add place-level metric columns so cards show noise/tables/outlets from Supabase data.
-- If columns already exist (e.g. added in dashboard), these use IF NOT EXISTS where supported.

-- noise_level: same enum as ratings (silent, quiet, vibrant)
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS noise_level noise_level DEFAULT NULL;

-- outlets_level: same enum as ratings (none, limited, ample)
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS outlets_level outlets_label DEFAULT NULL;

-- tables_level: may already exist with enum tables_level_enum (limited, mixed, ideal).
-- If not, add as text to avoid enum name conflicts (dashboard may use tables_level_enum).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'tables_level'
  ) THEN
    ALTER TABLE places ADD COLUMN tables_level text DEFAULT NULL;
  END IF;
END
$$;
