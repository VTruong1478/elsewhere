-- Public notes for place detail: short author label + note text (non-hidden ratings only).
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
  and btrim(r.notes) <> '';
