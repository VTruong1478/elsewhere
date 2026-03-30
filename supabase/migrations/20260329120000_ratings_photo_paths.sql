-- Multiple photos per rating: keep photo_path as first image for backward compatibility.
ALTER TABLE public.ratings
ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.ratings
SET photo_paths = ARRAY[trim(photo_path)]::text[]
WHERE photo_path IS NOT NULL
  AND btrim(photo_path) <> ''
  AND cardinality(photo_paths) = 0;

COMMENT ON COLUMN public.ratings.photo_paths IS 'All user-uploaded rating photo storage paths; photo_path mirrors [0] for legacy consumers';
