-- Remove 'ideal' from tables_level: keep only none, limited, ample.
-- Existing rows with 'ideal' are converted to 'ample'. NULL stays NULL.
-- Run in Supabase SQL Editor or via migration.

-- 1. Create new enum with only the three values
CREATE TYPE tables_level_enum_new AS ENUM ('none', 'limited', 'ample');

-- 2. Change column to new type, mapping ideal -> ample
ALTER TABLE places
  ALTER COLUMN tables_level TYPE tables_level_enum_new
  USING (
    CASE
      WHEN tables_level IS NULL THEN NULL
      WHEN tables_level::text = 'ideal' THEN 'ample'::tables_level_enum_new
      WHEN tables_level::text IN ('none', 'limited', 'ample') THEN (tables_level::text)::tables_level_enum_new
      ELSE 'limited'::tables_level_enum_new
    END
  );

-- 3. Drop old enum
DROP TYPE tables_level_enum;

-- 4. Rename new enum to original name
ALTER TYPE tables_level_enum_new RENAME TO tables_level_enum;
