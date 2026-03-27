create index place_submissions_user_id_idx
on public.place_submissions (user_id);

create index place_submissions_status_idx
on public.place_submissions (status);

create index place_submissions_created_at_idx
on public.place_submissions (created_at desc);