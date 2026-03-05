-- Create places.tables_level enum and column (required before 000004 can replace the enum).
-- Type is replaced in 20250305000004 with none/limited/ample.
CREATE TYPE tables_level_enum AS ENUM ('limited', 'mixed', 'ideal');

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS tables_level tables_level_enum DEFAULT NULL;
