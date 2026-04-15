-- Add denormalized submitter identity fields to existing place_submissions rows
-- so moderators can scan table records without joining profiles/auth users.

alter table public.place_submissions
  add column if not exists submitter_full_name text,
  add column if not exists submitter_email text;

-- Backfill existing rows from profile + auth user identity.
update public.place_submissions ps
set
  submitter_full_name = coalesce(nullif(btrim(p.full_name), ''), ps.submitter_full_name),
  submitter_email = coalesce(u.email, ps.submitter_email)
from public.profiles p
left join auth.users u on u.id = p.id
where p.id = ps.user_id
  and (
    ps.submitter_full_name is null or btrim(ps.submitter_full_name) = ''
    or ps.submitter_email is null or btrim(ps.submitter_email) = ''
  );
