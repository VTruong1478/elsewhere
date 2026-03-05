-- Vibe photo: admin-selected photo ref and attribution (do not upload to storage).
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS vibe_photo_ref text NULL,
  ADD COLUMN IF NOT EXISTS vibe_photo_attribution jsonb NULL;
