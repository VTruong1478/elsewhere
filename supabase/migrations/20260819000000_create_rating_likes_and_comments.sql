-- Likes and comments on ratings (social feed + profile rating cards).
--
-- Counts are computed per request via public.get_rating_social_counts rather
-- than denormalized onto `ratings`. place_stats exists because get_feed_places
-- aggregates over an unbounded radius fan-out; here the id set is capped by the
-- feed page size (<=21) and the profile limit (50), and a per-viewer
-- "has this user liked it" lookup is needed anyway.

create table if not exists rating_likes (
  rating_id uuid references ratings(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (rating_id, user_id)
);

create table if not exists rating_comments (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references ratings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rating_comments_body_length check (char_length(body) between 1 and 500),
  constraint rating_comments_body_not_blank check (btrim(body) <> '')
);

-- The composite PK already covers (rating_id) and (rating_id, user_id) lookups.
create index if not exists rating_likes_user_id_idx
  on rating_likes (user_id);

-- Thread reads, oldest first within a rating.
create index if not exists rating_comments_rating_id_created_at_idx
  on rating_comments (rating_id, created_at);

-- Author lookups and the per-user rate-limit window count.
create index if not exists rating_comments_user_id_created_at_idx
  on rating_comments (user_id, created_at desc);

alter table rating_likes enable row level security;
alter table rating_comments enable row level security;

create policy "Users can view rating likes"
  on rating_likes for select
  using (true);

create policy "Users can insert their own rating likes"
  on rating_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own rating likes"
  on rating_likes for delete
  using (auth.uid() = user_id);

create policy "Users can view rating comments"
  on rating_comments for select
  using (true);

create policy "Users can insert their own rating comments"
  on rating_comments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rating comments"
  on rating_comments for update
  using (auth.uid() = user_id);

-- Comment author OR the owner of the rating may remove a comment.
create policy "Comment author or rating owner can delete rating comments"
  on rating_comments for delete
  using (
    auth.uid() = user_id
    or auth.uid() = (select r.user_id from ratings r where r.id = rating_id)
  );

-- One round trip for like_count + comment_count + viewer_has_liked over a batch
-- of rating ids. security definer because app traffic uses the service role and
-- `ratings` select is owner-only for authenticated users.
create or replace function public.get_rating_social_counts(
  p_rating_ids uuid[],
  p_viewer_id uuid default null
)
returns table (
  rating_id uuid,
  like_count integer,
  comment_count integer,
  viewer_has_liked boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- left join lateral (not group by) so ratings with zero likes/comments still
  -- produce exactly one row per input id.
  select
    r.id as rating_id,
    coalesce(l.cnt, 0)::integer as like_count,
    coalesce(c.cnt, 0)::integer as comment_count,
    (p_viewer_id is not null and vl.user_id is not null) as viewer_has_liked
  from unnest(p_rating_ids) as r(id)
  left join lateral (
    select count(*) as cnt from rating_likes rl where rl.rating_id = r.id
  ) l on true
  left join lateral (
    select count(*) as cnt from rating_comments rc where rc.rating_id = r.id
  ) c on true
  left join rating_likes vl
    on vl.rating_id = r.id and vl.user_id = p_viewer_id;
$$;

grant execute on function public.get_rating_social_counts(uuid[], uuid) to authenticated;
grant execute on function public.get_rating_social_counts(uuid[], uuid) to anon;
grant execute on function public.get_rating_social_counts(uuid[], uuid) to service_role;
