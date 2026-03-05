-- Replace places.tables_level enum with limited, mixed, ideal only.
-- Run each block in Supabase SQL Editor (or all at once). Existing none/ample become 'limited'.

-- 1. Create new enum with the three desired values
CREATE TYPE tables_level_enum_new AS ENUM ('limited', 'mixed', 'ideal');

-- 2. Change column to new type (map old values into new enum)
ALTER TABLE places
  ALTER COLUMN tables_level TYPE tables_level_enum_new
  USING (
    CASE
      WHEN tables_level IS NULL THEN NULL
      WHEN tables_level::text = 'limited' THEN 'limited'::tables_level_enum_new
      WHEN tables_level::text = 'mixed' THEN 'mixed'::tables_level_enum_new
      WHEN tables_level::text = 'ideal' THEN 'ideal'::tables_level_enum_new
      WHEN tables_level::text IN ('none', 'ample') THEN 'limited'::tables_level_enum_new
      ELSE 'limited'::tables_level_enum_new
    END
  );

-- 3. Drop old enum
DROP TYPE tables_level_enum;

-- 4. Rename new enum to original name
ALTER TYPE tables_level_enum_new RENAME TO tables_level_enum;
