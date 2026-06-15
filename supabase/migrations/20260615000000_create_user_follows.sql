create table user_follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

alter table user_follows enable row level security;

create policy "Users can view follows"
  on user_follows for select
  using (true);

create policy "Users can insert their own follows"
  on user_follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can delete their own follows"
  on user_follows for delete
  using (auth.uid() = follower_id);
