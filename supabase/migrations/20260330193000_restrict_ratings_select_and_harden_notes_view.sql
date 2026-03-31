-- Restrict raw ratings reads to owner-only access.
-- Keep public note surfaces on place_notes_public only.

-- 1) Remove broad authenticated SELECT on ratings.
drop policy if exists ratings_select_authenticated on public.ratings;

-- 2) Enforce owner-only SELECT for authenticated users.
drop policy if exists ratings_select_own on public.ratings;
create policy ratings_select_own
  on public.ratings
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3) Defense-in-depth: anon should never directly select ratings.
revoke select on table public.ratings from anon;

-- 4) Public notes view: expose only safe fields for UI.
create or replace view public.place_notes_public as
select
  r.place_id,
  r.id as rating_id,
  r.notes,
  r.updated_at as created_at,
  case
    when p.full_name is null or btrim(p.full_name) = '' then 'Anonymous'
    when strpos(btrim(p.full_name), ' ') = 0 then btrim(p.full_name)
    else
      split_part(btrim(p.full_name), ' ', 1) || ' ' ||
      left(split_part(btrim(p.full_name), ' ', array_length(string_to_array(btrim(p.full_name), ' '), 1)), 1) || '.'
  end as author_short_name
from public.ratings r
join public.profiles p
  on p.id = r.user_id
where r.notes is not null
  and btrim(r.notes) <> ''
  and coalesce(r.is_hidden, false) = false;
