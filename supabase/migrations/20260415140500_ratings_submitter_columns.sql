-- Add denormalized submitter identity fields to ratings for easier moderation.
-- Keep values in sync from user_id -> profiles/auth.users.

alter table public.ratings
  add column if not exists submitter_full_name text,
  add column if not exists submitter_email text;

-- Backfill existing rows.
update public.ratings r
set
  submitter_full_name = coalesce(nullif(btrim(p.full_name), ''), r.submitter_full_name),
  submitter_email = coalesce(u.email, r.submitter_email)
from public.profiles p
left join auth.users u on u.id = p.id
where p.id = r.user_id
  and (
    r.submitter_full_name is null or btrim(r.submitter_full_name) = ''
    or r.submitter_email is null or btrim(r.submitter_email) = ''
  );

create or replace function public.fill_rating_submitter_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select
    nullif(btrim(p.full_name), ''),
    u.email
  into
    new.submitter_full_name,
    new.submitter_email
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_ratings_fill_submitter_fields on public.ratings;
create trigger trg_ratings_fill_submitter_fields
before insert or update of user_id
on public.ratings
for each row
execute function public.fill_rating_submitter_fields();
