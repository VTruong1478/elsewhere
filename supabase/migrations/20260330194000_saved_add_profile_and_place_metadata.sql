-- Add denormalized saver and place metadata to saved rows.
-- This keeps a snapshot of who saved and what place name was saved.

ALTER TABLE public.saved
ADD COLUMN IF NOT EXISTS profile_id uuid;

ALTER TABLE public.saved
ADD COLUMN IF NOT EXISTS profile_name text;

ALTER TABLE public.saved
ADD COLUMN IF NOT EXISTS place_name text;

UPDATE public.saved s
SET
  profile_id = s.user_id,
  profile_name = COALESCE(NULLIF(btrim(p.full_name), ''), 'Anonymous'),
  place_name = pl.name
FROM public.profiles p, public.places pl
WHERE p.id = s.user_id
  AND pl.id = s.place_id
  AND (
    s.profile_id IS NULL
    OR s.profile_name IS NULL
    OR btrim(s.profile_name) = ''
    OR s.place_name IS NULL
    OR btrim(s.place_name) = ''
  );

ALTER TABLE public.saved
ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.saved
ALTER COLUMN profile_name SET NOT NULL;

ALTER TABLE public.saved
ALTER COLUMN place_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saved_profile_id_fkey'
      AND conrelid = 'public.saved'::regclass
  ) THEN
    ALTER TABLE public.saved
    ADD CONSTRAINT saved_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END $$;
