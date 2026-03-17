-- Seed: Northern Virginia / Annandale third spaces (cafes and libraries)
-- All places are within ~10 miles of Annandale, VA (38.8304, -77.1941).
-- opening_hours: Google Places-style periods (day 0=Sun .. 6=Sat, time HHMM).

BEGIN;

-- 1. George Mason Regional Library (Annandale)
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'George Mason Regional Library',
    '7001 Little River Turnpike, Annandale, VA 22003',
    38.8320,
    -77.2100,
    'library',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"1000"},"close":{"day":1,"time":"2100"}},
      {"open":{"day":2,"time":"1000"},"close":{"day":2,"time":"2100"}},
      {"open":{"day":3,"time":"1000"},"close":{"day":3,"time":"2100"}},
      {"open":{"day":4,"time":"1000"},"close":{"day":4,"time":"2100"}},
      {"open":{"day":5,"time":"1000"},"close":{"day":5,"time":"1800"}},
      {"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1800"}},
      {"open":{"day":0,"time":"1300"},"close":{"day":0,"time":"1700"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 2. City of Fairfax Regional Library (Fairfax)
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'City of Fairfax Regional Library',
    '10360 North Street, Fairfax, VA 22030',
    38.8523,
    -77.3043,
    'library',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"1000"},"close":{"day":1,"time":"2100"}},
      {"open":{"day":2,"time":"1000"},"close":{"day":2,"time":"2100"}},
      {"open":{"day":3,"time":"1000"},"close":{"day":3,"time":"2100"}},
      {"open":{"day":4,"time":"1000"},"close":{"day":4,"time":"2100"}},
      {"open":{"day":5,"time":"1000"},"close":{"day":5,"time":"1800"}},
      {"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1800"}},
      {"open":{"day":0,"time":"1300"},"close":{"day":0,"time":"1700"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 3. Thomas Jefferson Library (Falls Church)
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'Thomas Jefferson Library',
    '7415 Arlington Boulevard, Falls Church, VA 22042',
    38.8720,
    -77.2070,
    'library',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"1000"},"close":{"day":1,"time":"2100"}},
      {"open":{"day":2,"time":"1000"},"close":{"day":2,"time":"2100"}},
      {"open":{"day":3,"time":"1000"},"close":{"day":3,"time":"2100"}},
      {"open":{"day":4,"time":"1000"},"close":{"day":4,"time":"2100"}},
      {"open":{"day":5,"time":"1000"},"close":{"day":5,"time":"1800"}},
      {"open":{"day":6,"time":"1000"},"close":{"day":6,"time":"1800"}},
      {"open":{"day":0,"time":"1300"},"close":{"day":0,"time":"1700"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 4. De Clieu Coffee & Sandwich - Fairfax
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'De Clieu Coffee & Sandwich - Fairfax',
    '10389 Main Street, Fairfax, VA 22030',
    38.8465,
    -77.3066,
    'cafe',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"2000"}},
      {"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"2000"}},
      {"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"2000"}},
      {"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"2000"}},
      {"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"2100"}},
      {"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2100"}},
      {"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"1900"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 5. Shilla Bakery Vienna
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'Shilla Bakery Vienna',
    '2670A Avenir Place, Vienna, VA 22180',
    38.8770,
    -77.2305,
    'cafe',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"2000"}},
      {"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"2000"}},
      {"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"2000"}},
      {"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"2000"}},
      {"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"2100"}},
      {"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2100"}},
      {"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"1900"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 6. Breeze Bakery Cafe (Annandale)
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'Breeze Bakery Cafe',
    '4125 Hummer Road, Annandale, VA 22003',
    38.8445,
    -77.1850,
    'cafe',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"0800"},"close":{"day":1,"time":"2200"}},
      {"open":{"day":2,"time":"0800"},"close":{"day":2,"time":"2200"}},
      {"open":{"day":3,"time":"0800"},"close":{"day":3,"time":"2200"}},
      {"open":{"day":4,"time":"0800"},"close":{"day":4,"time":"2200"}},
      {"open":{"day":5,"time":"0800"},"close":{"day":5,"time":"2300"}},
      {"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2300"}},
      {"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"2100"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 7. Foundation Coffee (Fairfax)
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'Foundation Coffee',
    '9650 Main Street Suite 42, Fairfax, VA 22031',
    38.8528,
    -77.2739,
    'cafe',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"0700"},"close":{"day":1,"time":"2000"}},
      {"open":{"day":2,"time":"0700"},"close":{"day":2,"time":"2000"}},
      {"open":{"day":3,"time":"0700"},"close":{"day":3,"time":"2000"}},
      {"open":{"day":4,"time":"0700"},"close":{"day":4,"time":"2000"}},
      {"open":{"day":5,"time":"0700"},"close":{"day":5,"time":"2100"}},
      {"open":{"day":6,"time":"0800"},"close":{"day":6,"time":"2100"}},
      {"open":{"day":0,"time":"0800"},"close":{"day":0,"time":"1900"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

-- 8. Barnes & Noble - Mosaic District
WITH new_place AS (
  INSERT INTO places (
    google_place_id,
    name,
    address,
    lat,
    lng,
    place_type,
    has_wifi,
    google_photo_ref,
    opening_hours,
    timezone,
    is_active,
    created_by
  )
  VALUES (
    NULL,
    'Barnes & Noble - Mosaic District',
    '2905 District Ave, Fairfax, VA 22031',
    38.8610,
    -77.3530,
    'bookstore',
    NULL,
    NULL,
    '{"periods":[
      {"open":{"day":1,"time":"0900"},"close":{"day":1,"time":"2100"}},
      {"open":{"day":2,"time":"0900"},"close":{"day":2,"time":"2100"}},
      {"open":{"day":3,"time":"0900"},"close":{"day":3,"time":"2100"}},
      {"open":{"day":4,"time":"0900"},"close":{"day":4,"time":"2100"}},
      {"open":{"day":5,"time":"0900"},"close":{"day":5,"time":"2200"}},
      {"open":{"day":6,"time":"0900"},"close":{"day":6,"time":"2200"}},
      {"open":{"day":0,"time":"1000"},"close":{"day":0,"time":"2000"}}
    ]}'::jsonb,
    'America/New_York',
    TRUE,
    NULL
  )
  RETURNING id
)
INSERT INTO place_stats (place_id, rating_count)
SELECT id, 0 FROM new_place;

COMMIT;
