-- add username column
alter table profiles add column if not exists username text;

-- unique index
create unique index if not exists profiles_username_unique on profiles(username);

-- backfill existing users using their full_name lowercased with spaces removed
update profiles
set username = lower(replace(full_name, ' ', ''))
where username is null and full_name is not null;
