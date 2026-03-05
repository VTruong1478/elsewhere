-- Allow unauthenticated feed: anon can read places and place_stats and call get_feed_places.
create policy "anon_read_places" on places
  for select to anon using (true);

create policy "anon_read_place_stats" on place_stats
  for select to anon using (true);

grant execute on function get_feed_places(double precision, double precision, double precision, text, text) to anon;
