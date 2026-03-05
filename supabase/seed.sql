-- Seed: Atlanta third spaces (cafes and libraries)
-- Run after migrations. Each place gets an empty place_stats row (trigger + explicit upsert).
-- opening_hours: periods array (day 0=Sun .. 6=Sat, time HHMM). Used by feed for "Open late" etc.
-- Example: Mon–Fri 7am–9pm, Sat 8am–8pm, Sun 9am–6pm

INSERT INTO places (id, name, address, lat, lng, place_type, opening_hours, timezone) VALUES
  ('a1b2c3d4-e5f6-4789-a012-000000000001', 'Octane Coffee', '1000 Marietta St NW, Atlanta, GA 30318', 33.7774, -84.4052, 'cafe',
   '{"periods":[{"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"2100"}},{"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"2100"}},{"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"2100"}},{"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"2100"}},{"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"2100"}},{"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2000"}},{"open":{"day":0,"time":"0900"},"close":{"day":0,"time":"1800"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000002', 'Atlanta-Fulton Central Library', '1 Margaret Mitchell Square, Atlanta, GA 30303', 33.7560, -84.3875, 'library',
   '{"periods":[{"open":{"day":1,"time":"0900"},"close":{"day":1,"time":"2000"}},{"open":{"day":2,"time":"0900"},"close":{"day":2,"time":"2000"}},{"open":{"day":3,"time":"0900"},"close":{"day":3,"time":"2000"}},{"open":{"day":4,"time":"0900"},"close":{"day":4,"time":"2000"}},{"open":{"day":5,"time":"0900"},"close":{"day":5,"time":"1800"}},{"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1800"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000003', 'Dancing Goats Coffee Bar', '419 W Ponce de Leon Ave, Decatur, GA 30030', 33.7754, -84.2964, 'cafe',
   '{"periods":[{"open":{"day":1,"time":"0630"},"close":{"day":1,"time":"2000"}},{"open":{"day":2,"time":"0630"},"close":{"day":2,"time":"2000"}},{"open":{"day":3,"time":"0630"},"close":{"day":3,"time":"2000"}},{"open":{"day":4,"time":"0630"},"close":{"day":4,"time":"2000"}},{"open":{"day":5,"time":"0630"},"close":{"day":5,"time":"2100"}},{"open":{"day":6,"time":"0700"},"close":{"day":6,"time":"2100"}},{"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"2000"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000004', 'Chrome Yellow Trading Co', '501 Memorial Dr SE, Atlanta, GA 30312', 33.7472, -84.3710, 'cafe',
   '{"periods":[{"open":{"day":1,"time":"0800"},"close":{"day":1,"time":"2200"}},{"open":{"day":2,"time":"0800"},"close":{"day":2,"time":"2200"}},{"open":{"day":3,"time":"0800"},"close":{"day":3,"time":"2200"}},{"open":{"day":4,"time":"0800"},"close":{"day":4,"time":"2200"}},{"open":{"day":5,"time":"0800"},"close":{"day":5,"time":"2300"}},{"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2300"}},{"open":{"day":0,"time":"0900"},"close":{"day":0,"time":"2000"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000005', 'Aurora Coffee', '468 Moreland Ave NE, Atlanta, GA 30307', 33.7680, -84.3498, 'cafe',
   '{"periods":[{"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"2100"}},{"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"2100"}},{"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"2100"}},{"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"2100"}},{"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"2200"}},{"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2200"}},{"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"2000"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000006', 'Peachtree Branch Library', '1315 Peachtree St NE, Atlanta, GA 30309', 33.7876, -84.3843, 'library',
   '{"periods":[{"open":{"day":1,"time":"1000"},"close":{"day":1,"time":"2000"}},{"open":{"day":2,"time":"1000"},"close":{"day":2,"time":"2000"}},{"open":{"day":3,"time":"1000"},"close":{"day":3,"time":"2000"}},{"open":{"day":4,"time":"1000"},"close":{"day":4,"time":"2000"}},{"open":{"day":5,"time":"1000"},"close":{"day":5,"time":"1800"}},{"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1700"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000007', 'Brash Coffee', '1180 West Peachtree St NW, Atlanta, GA 30309', 33.7815, -84.3872, 'cafe',
   '{"periods":[{"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"1800"}},{"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"1800"}},{"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"1800"}},{"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"1800"}},{"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"1800"}},{"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"1700"}}]}'::jsonb,
   'America/New_York'),
  ('a1b2c3d4-e5f6-4789-a012-000000000008', 'Decatur Library', '215 Sycamore St, Decatur, GA 30030', 33.7753, -84.2972, 'library',
   '{"periods":[{"open":{"day":1,"time":"0900"},"close":{"day":1,"time":"2100"}},{"open":{"day":2,"time":"0900"},"close":{"day":2,"time":"2100"}},{"open":{"day":3,"time":"0900"},"close":{"day":3,"time":"2100"}},{"open":{"day":4,"time":"0900"},"close":{"day":4,"time":"2100"}},{"open":{"day":5,"time":"0900"},"close":{"day":5,"time":"1800"}},{"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1700"}}]}'::jsonb,
   'America/New_York')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  place_type = EXCLUDED.place_type,
  opening_hours = EXCLUDED.opening_hours,
  timezone = EXCLUDED.timezone,
  updated_at = now();

-- Upsert empty place_stats for each place (trigger also creates on INSERT; this ensures idempotent seed)
INSERT INTO place_stats (
  place_id, rating_count,
  noise_silent, noise_quiet, noise_vibrant,
  tables_limited, tables_mixed, tables_ideal,
  outlets_none, outlets_limited, outlets_ample,
  vibe_focus, vibe_mixed, vibe_social,
  updated_at
)
SELECT id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now()
FROM places
WHERE id IN (
  'a1b2c3d4-e5f6-4789-a012-000000000001',
  'a1b2c3d4-e5f6-4789-a012-000000000002',
  'a1b2c3d4-e5f6-4789-a012-000000000003',
  'a1b2c3d4-e5f6-4789-a012-000000000004',
  'a1b2c3d4-e5f6-4789-a012-000000000005',
  'a1b2c3d4-e5f6-4789-a012-000000000006',
  'a1b2c3d4-e5f6-4789-a012-000000000007',
  'a1b2c3d4-e5f6-4789-a012-000000000008'
)
ON CONFLICT (place_id) DO UPDATE SET
  rating_count = 0,
  noise_silent = 0, noise_quiet = 0, noise_vibrant = 0,
  tables_limited = 0, tables_mixed = 0, tables_ideal = 0,
  outlets_none = 0, outlets_limited = 0, outlets_ample = 0,
  vibe_focus = 0, vibe_mixed = 0, vibe_social = 0,
  avg_wifi = NULL,
  updated_at = now();
