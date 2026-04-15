-- Ensure authenticated users can write ratings under RLS policies.
-- This addresses production environments where table privileges were tightened
-- and inserts/updates began failing with "permission denied for table ratings".

grant select, insert, update, delete on table public.ratings to authenticated;

-- Keep direct anonymous table access disabled; public note reads come from views.
revoke all on table public.ratings from anon;
