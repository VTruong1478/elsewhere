-- One-off cleanup (beta): keep only places whose address contains "Annandale"
-- (case-insensitive). Run in Supabase SQL Editor on the target DB.
--
-- PREREQUISITE — run once before this script (fixes FK error on bulk delete):
-- Apply migration `supabase/migrations/20260415170000_update_place_stats_skip_missing_place.sql`
-- in the SQL Editor (full file), OR `supabase db push` if you use the CLI.
-- Without it, deleting many places can error: place_stats insert after place row is gone.
--
-- Order: (1) preview counts → (2) delete `saved` for places you will remove →
-- (3) delete those `places` rows. `ratings` and `place_stats` cascade.
--
-- Review the preview queries below first. Then run the transaction block.
-- If `places_to_keep` is 0, do NOT run the deletes — you would wipe every place.

-- -----------------------------------------------------------------------------
-- Step 1 — Preview (run these; adjust the ILIKE pattern if needed)
-- -----------------------------------------------------------------------------

-- Places that would be REMOVED (no "annandale" substring in address)
-- SELECT id, name, address
-- FROM places
-- WHERE address NOT ILIKE '%annandale%';

-- SELECT count(*) AS places_to_remove
-- FROM places
-- WHERE address NOT ILIKE '%annandale%';

-- SELECT count(*) AS places_to_keep
-- FROM places
-- WHERE address ILIKE '%annandale%';

-- Saved rows that block delete if not removed first
-- SELECT count(*) AS saved_rows_to_clear
-- FROM saved
-- WHERE place_id IN (
--   SELECT id FROM places WHERE address NOT ILIKE '%annandale%'
-- );

-- -----------------------------------------------------------------------------
-- Steps 2 & 3 — Delete saved, then places (transaction)
-- -----------------------------------------------------------------------------

BEGIN;

DELETE FROM saved
WHERE place_id IN (
  SELECT id FROM places WHERE address NOT ILIKE '%annandale%'
);

DELETE FROM places
WHERE address NOT ILIKE '%annandale%';

COMMIT;

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------

-- SELECT count(*) FROM places;
-- SELECT count(*) FROM places WHERE address ILIKE '%annandale%';
-- Should match: all remaining rows have Annandale in address.
