-- Ensure all place photo / Google ID columns exist (idempotent for any DB state).
ALTER TABLE places ADD COLUMN IF NOT EXISTS google_place_id text NULL;
ALTER TABLE places ADD COLUMN IF NOT EXISTS google_photo_ref text NULL;
ALTER TABLE places ADD COLUMN IF NOT EXISTS google_photo_attribution text NULL;
ALTER TABLE places ADD COLUMN IF NOT EXISTS vibe_photo_ref text NULL;
ALTER TABLE places ADD COLUMN IF NOT EXISTS vibe_photo_attribution jsonb NULL;
