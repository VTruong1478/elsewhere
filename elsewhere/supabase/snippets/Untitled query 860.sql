-- 1) Enums (optional but nice)
do $$ begin
  create type place_type_enum as enum ('cafe', 'library', 'restaurant', 'coworking', 'park', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type noise_level_enum as enum ('silent', 'quiet', 'vibrant');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type tables_level_enum as enum ('ideal', 'limited');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type outlets_level_enum as enum ('ample', 'some', 'scarce');
exception when duplicate_object then null;
end $$;

-- 2) Update places to have fields your mockup needs
alter table public.places
  add column if not exists score_percent smallint check (score_percent between 0 and 100),
  add column if not exists ratings_count integer not null default 0,
  add column if not exists noise_level noise_level_enum,
  add column if not exists tables_level tables_level_enum,
  add column if not exists outlets_level outlets_level_enum,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists cover_photo_url text;

-- If you want to enforce place_type values with an enum:
-- only run this if all existing place_type values are valid ('cafe' or 'library' etc)
alter table public.places
  alter column place_type type place_type_enum
  using (place_type::place_type_enum);

-- 3) Photos table for google refs + uploads
create table if not exists public.place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  source text not null check (source in ('google', 'upload')),
  storage_bucket text,
  storage_path text,
  google_photo_ref text,
  google_photo_attribution text,
  width integer,
  height integer,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists place_photos_place_id_idx on public.place_photos(place_id);

create unique index if not exists place_photos_one_cover_per_place
  on public.place_photos(place_id)
  where (is_cover);

-- 4) Saves table for the bookmark icon
create table if not exists public.place_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- 5) RLS
alter table public.place_photos enable row level security;
alter table public.place_saves enable row level security;

-- Photos readable by everyone (adjust later if needed)
drop policy if exists "photos readable by everyone" on public.place_photos;
create policy "photos readable by everyone"
on public.place_photos for select
using (true);

-- Saves: only the user can read/write their saves
drop policy if exists "read own saves" on public.place_saves;
create policy "read own saves"
on public.place_saves for select
using (auth.uid() = user_id);

drop policy if exists "insert own saves" on public.place_saves;
create policy "insert own saves"
on public.place_saves for insert
with check (auth.uid() = user_id);

drop policy if exists "delete own saves" on public.place_saves;
create policy "delete own saves"
on public.place_saves for delete
using (auth.uid() = user_id);