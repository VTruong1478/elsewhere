# Elsewhere — Backend Plan

Mobile-first web app for discovering third spaces (cafes, libraries, bookstores) in the Northern Virginia area. Feed-first, location-based recommendations with personalized match scores.

---

## CRITICAL RULES FOR CURSOR

These rules are non-negotiable. Never deviate from them.

1. **Never write directly to `places` or `place_stats` from the client.** All inserts and updates to these tables go through Next.js Route Handlers using the service role key only.
2. **Never expose `user_id` from ratings to other users.** All client-facing rating reads use the `ratings_public` view. Never query the raw `ratings` table from the client.
3. **Never hard delete a place row.** Always set `is_active = false`.
4. **Never store a permanent Google photo URL.** Store only `google_photo_ref` and serve photos via a server proxy route.
5. **Never ship the service role key to the browser.** It lives in server-only environment variables.
6. **Every mutation goes through a route handler.** Ratings, place submissions, saves — no alternate server write paths. This is how rate limits and validation are consistently enforced.
7. **Always create a `place_stats` row in the same transaction as the place insert.** Never lazy-create it on first rating.
8. **Reject ratings and saves on inactive places** (`is_active = false`) in the route handler before any DB write.
9. **Photo upload happens after the rating row is created.** Never allow standalone photo uploads outside a rating submission.
10. **All categorical DB fields use Postgres enums.** Never use plain text for noise, vibe, tables, outlets, or place_type.

---

## 1. Stack

- **Framework:** Next.js (App Router)
- **Database:** Supabase Postgres with Row Level Security (RLS)
- **Auth:** Supabase Auth — Google OAuth only
- **Storage:** Supabase Storage (bucket: `user-photos`)
- **External API:** Google Places API — server-side only, never in client bundle
- **Distance filtering:** Postgres `earthdistance` extension (requires `cube` extension)

---

## 2. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server only, never in client bundle
GOOGLE_PLACES_API_KEY            # server only, never in client bundle
```

---

## 3. Database Schema

### 3.1 Postgres Extensions

Enable once in Supabase dashboard under Database → Extensions:

```sql
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
```

### 3.2 Enums

```sql
CREATE TYPE noise_level   AS ENUM ('silent', 'quiet', 'vibrant');
CREATE TYPE vibe_level    AS ENUM ('focused', 'casual', 'social');
CREATE TYPE tables_level  AS ENUM ('limited', 'mixed', 'plentiful');
CREATE TYPE outlets_level AS ENUM ('scarce', 'some', 'ample');
CREATE TYPE place_type    AS ENUM ('cafe', 'library', 'bookstore');
```

### 3.3 Tables

#### profiles

```sql
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

#### user_preferences

```sql
CREATE TABLE user_preferences (
  user_id      uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  radius_miles numeric DEFAULT 5,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
```

#### places

```sql
CREATE TABLE places (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id           text,
  name                      text NOT NULL,
  address                   text NOT NULL,
  lat                       numeric NOT NULL,
  lng                       numeric NOT NULL,
  place_type                place_type NOT NULL,
  has_wifi                  boolean,
  google_photo_ref          text,
  opening_hours             jsonb,
  timezone                  text,
  is_active                 boolean DEFAULT true NOT NULL,
  created_by                uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX places_google_place_id_unique
  ON places (google_place_id)
  WHERE google_place_id IS NOT NULL;
```

#### place_stats

```sql
CREATE TABLE place_stats (
  place_id            uuid PRIMARY KEY REFERENCES places(id) ON DELETE RESTRICT,
  rating_count        integer DEFAULT 0,
  noise_silent        integer DEFAULT 0,
  noise_quiet         integer DEFAULT 0,
  noise_vibrant       integer DEFAULT 0,
  tables_limited      integer DEFAULT 0,
  tables_mixed        integer DEFAULT 0,
  tables_plentiful    integer DEFAULT 0,
  outlets_scarce      integer DEFAULT 0,
  outlets_some        integer DEFAULT 0,
  outlets_ample       integer DEFAULT 0,
  vibe_focused        integer DEFAULT 0,
  vibe_casual         integer DEFAULT 0,
  vibe_social         integer DEFAULT 0,
  avg_overall_rating  numeric,
  updated_at          timestamptz DEFAULT now()
);
```

#### ratings

```sql
CREATE TABLE ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id       uuid NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  noise          noise_level NOT NULL,
  vibe           vibe_level NOT NULL,
  tables         tables_level NOT NULL,
  outlets        outlets_level NOT NULL,
  overall_rating numeric(3,1) NOT NULL
    CHECK (overall_rating >= 0 AND overall_rating <= 5)
    CHECK (overall_rating * 2 = FLOOR(overall_rating * 2)),
  photo_path     text,
  notes          text CHECK (char_length(notes) <= 500),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT ratings_user_place_unique UNIQUE (user_id, place_id)
);
```

#### saved

```sql
CREATE TABLE saved (
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  place_id  uuid NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
  saved_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);
```

### 3.4 ratings_public View

The client role has no direct SELECT on the raw `ratings` table. All client reads go through this view. Grant SELECT to authenticated role only — not anon.

```sql
CREATE VIEW ratings_public AS
  SELECT
    place_id,
    noise,
    vibe,
    tables,
    outlets,
    overall_rating,
    photo_path,
    notes,
    created_at
  FROM ratings;

REVOKE SELECT ON ratings FROM authenticated;
GRANT SELECT ON ratings_public TO authenticated;
```

### 3.5 place_stats Trigger

Fires AFTER INSERT, UPDATE, DELETE on `ratings`. Always does a full recompute from remaining rows — never increments or decrements. Runs with SECURITY DEFINER. Uses OLD.place_id for DELETE, NEW.place_id for INSERT/UPDATE.

```sql
CREATE OR REPLACE FUNCTION update_place_stats()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  target_place_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_place_id := OLD.place_id;
  ELSE
    target_place_id := NEW.place_id;
  END IF;

  INSERT INTO place_stats (
    place_id, rating_count,
    noise_silent, noise_quiet, noise_vibrant,
    tables_limited, tables_mixed, tables_plentiful,
    outlets_scarce, outlets_some, outlets_ample,
    vibe_focused, vibe_casual, vibe_social,
    avg_overall_rating, updated_at
  )
  SELECT
    target_place_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE noise = 'silent'),
    COUNT(*) FILTER (WHERE noise = 'quiet'),
    COUNT(*) FILTER (WHERE noise = 'vibrant'),
    COUNT(*) FILTER (WHERE tables = 'limited'),
    COUNT(*) FILTER (WHERE tables = 'mixed'),
    COUNT(*) FILTER (WHERE tables = 'plentiful'),
    COUNT(*) FILTER (WHERE outlets = 'scarce'),
    COUNT(*) FILTER (WHERE outlets = 'some'),
    COUNT(*) FILTER (WHERE outlets = 'ample'),
    COUNT(*) FILTER (WHERE vibe = 'focused'),
    COUNT(*) FILTER (WHERE vibe = 'casual'),
    COUNT(*) FILTER (WHERE vibe = 'social'),
    AVG(overall_rating),
    now()
  FROM ratings
  WHERE place_id = target_place_id
  ON CONFLICT (place_id) DO UPDATE SET
    rating_count       = EXCLUDED.rating_count,
    noise_silent       = EXCLUDED.noise_silent,
    noise_quiet        = EXCLUDED.noise_quiet,
    noise_vibrant      = EXCLUDED.noise_vibrant,
    tables_limited     = EXCLUDED.tables_limited,
    tables_mixed       = EXCLUDED.tables_mixed,
    tables_plentiful   = EXCLUDED.tables_plentiful,
    outlets_scarce     = EXCLUDED.outlets_scarce,
    outlets_some       = EXCLUDED.outlets_some,
    outlets_ample      = EXCLUDED.outlets_ample,
    vibe_focused       = EXCLUDED.vibe_focused,
    vibe_casual        = EXCLUDED.vibe_casual,
    vibe_social        = EXCLUDED.vibe_social,
    avg_overall_rating = EXCLUDED.avg_overall_rating,
    updated_at         = now();

  RETURN NULL;
END;
$$;

CREATE TRIGGER ratings_update_place_stats
AFTER INSERT OR UPDATE OR DELETE ON ratings
FOR EACH ROW EXECUTE FUNCTION update_place_stats();
```

### 3.6 Profile Creation Trigger

Fires on INSERT to `auth.users`. Creates a `profiles` row and a `user_preferences` row in the same operation. The auth callback then updates `full_name` and `avatar_url` from the Google OAuth response.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profiles (id, created_at, updated_at)
  VALUES (NEW.id, now(), now());

  INSERT INTO user_preferences (user_id, radius_miles, created_at, updated_at)
  VALUES (NEW.id, 5, now(), now());

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 4. Row Level Security

Enable RLS on every table. These policies are the complete set — do not add permissive policies without review.

```sql
-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles: own row" ON profiles
  FOR ALL USING (auth.uid() = id);

-- user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_preferences: own row" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- places: authenticated users read, service role writes
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "places: authenticated read" ON places
  FOR SELECT USING (auth.role() = 'authenticated');

-- place_stats: authenticated users read, trigger writes
ALTER TABLE place_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "place_stats: authenticated read" ON place_stats
  FOR SELECT USING (auth.role() = 'authenticated');

-- ratings: own row for write, public view for read
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ratings: own row insert" ON ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ratings: own row update" ON ratings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ratings: own row delete" ON ratings
  FOR DELETE USING (auth.uid() = user_id);

-- saved: own rows only
ALTER TABLE saved ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved: own rows" ON saved
  FOR ALL USING (auth.uid() = user_id);
```

---

## 5. Auth Flow

- Sign-in: `supabase.auth.signInWithOAuth({ provider: 'google' })` — client-side
- Callback route: `app/(auth)/auth/callback/route.ts`
  - Exchange code for session
  - Update `profiles.full_name` and `profiles.avatar_url` from Google OAuth metadata
  - Redirect to feed
- Middleware: `middleware.ts` — check session on all routes except `/login`, `/auth/callback`, and static assets. Redirect unauthenticated users to `/login`.

---

## 6. Route Handlers

All mutations use the Supabase service role client. All reads use the Supabase anon/user client with RLS.

### POST /api/places

Create a new place. Service role only.

1. Authenticate request — reject if no session
2. Check rate limit: max 5 place submissions per user per UTC day. Query `places WHERE created_by = user_id AND created_at >= start_of_today_utc`. Return `429` if at limit.
3. Check `is_active` of any existing place with same `google_place_id` — return existing place if found
4. Call Google Places API with `google_place_id` to fetch: name, address, lat, lng, place_type, `google_photo_ref`, opening_hours, timezone, `has_wifi` (from `freeWifi` field — store null if not returned)
5. Insert place row and place_stats row in the same transaction. place_stats initialised with all counts = 0.
6. Return created place

### GET /api/places/search

Search for places before submission.

1. Call Google Places API Text Search with `q` param
2. For each result, check if `google_place_id` already exists in `places`
3. Return list with `{ ...placeData, already_in_db: boolean }`

### GET /api/places/[id]/photo

Proxy Google place photo.

1. Fetch `google_photo_ref` from `places` for the given id
2. Call Google Places Photo API with the ref
3. Redirect to or stream the photo response
4. Attribution: include `google_photo_attribution` in response headers or alongside the image where required

### GET /api/feed

Feed and map data.

Query params:

- `lat`, `lng` — required. Return `400 { error: 'lat and lng are required' }` if missing or invalid. Never fall back to a default location server-side.
- `q` — optional search string, filters by place name/address via ILIKE
- `filter` — optional: `quiet`, `cafes`, `libraries`, `open_now`

Logic:

1. Load `user_preferences` for current user (radius_miles)
2. Load user's rating history from `ratings` for implied preference calculation
3. Query places within radius using earthdistance joined with place_stats. Only include `is_active = true` places.
4. Apply filter chips:
   - `quiet`: dominant noise level is silent or quiet (noise_silent or noise_quiet is the max count)
   - `cafes`: place_type = 'cafe'
   - `libraries`: place_type = 'library'
   - `open_now`: derived from opening_hours + timezone (default America/New_York if null)
5. Apply search `q` if present
6. For each place, compute match score (see Section 7)
7. Derive opening state: open_now, closes_at, closing_soon (within 30 min)
8. Sort: match_score DESC, distance ASC, rating_count DESC
9. Return max 20 results

Response payload per place:

```json
{
  "id": "uuid",
  "name": "string",
  "address": "string",
  "lat": 0,
  "lng": 0,
  "place_type": "cafe",
  "has_wifi": true,
  "google_photo_ref": "string",
  "distance_miles": 1.2,
  "is_active": true,
  "dominant_noise": "silent",
  "dominant_tables": "plentiful",
  "dominant_outlets": "ample",
  "dominant_vibe": "focused",
  "rating_count": 42,
  "match_score_percent": 92,
  "open_now": true,
  "closes_at": "9:00 PM",
  "closing_soon": false,
  "is_favorited": false
}
```

When `rating_count = 0`, set all dominant labels to null and `match_score_percent` to null. The UI shows "--" for null values.

### GET /api/places/[id]

Place detail.

Returns place row + place_stats + current user's rating (from raw `ratings` table server-side, user_id is safe here since it's their own row) + whether user has saved the place.

### POST /api/places/[id]/rate

Submit or update a rating. Upsert on (user_id, place_id).

1. Authenticate — reject if no session
2. Check rate limit: max 100 ratings per user per UTC day
3. Check place `is_active` — return `400` if false
4. Validate all required fields: noise, vibe, tables, outlets, overall_rating
5. Validate overall_rating is 0–5 in 0.5 increments
6. Upsert into `ratings`
7. Trigger fires automatically to update place_stats
8. If `photo_path` is included, verify the path contains the user's own user_id before accepting

### POST /api/saved

Save a place.

1. Check place `is_active` — return `400` if false
2. Insert into `saved` (upsert safe due to composite PK)

### DELETE /api/saved/[place_id]

Unsave a place. Delete from `saved` where user_id = auth.uid().

### PATCH /api/user/preferences

Update user radius.

Upsert `user_preferences.radius_miles` for the current user.

---

## 7. Match Score Formula

Computed server-side in `lib/matchScore.ts`. Never computed client-side.

### Step 1 — Derive implied preferences from rating history

For each metric (noise and vibe only — tables and outlets do not feed the score):

```
For each level in the metric:
  signal = max(0, overall_rating - 3)
  -- 5 → 2.0,  4 → 1.0,  3.5 → 0.5,  3 and below → 0
  total_signal = SUM of signal for all ratings where that level was selected

implied_preference = level with the highest total_signal
                     (only set if max total_signal > 0)
```

Only positively-rated venues (4+ stars) contribute to preference signal. A place rated 3 stars or below has signal = 0 and does not influence implied preferences. This prevents mediocre visits from distorting the preference toward their noise/vibe category.

If a user's highest total_signal for a metric is 0 (all ratings at 3 stars or below, or no ratings at all), that dimension has no implied preference. If both noise and vibe implied preferences are absent, skip personalized scoring and return `match_score_percent: null`. Feed sorts by distance only.

Ties (two levels with equal positive total_signal) use the middle value as tiebreaker: noise → Quiet, vibe → Casual.

### Step 2 — Score each place

```
noise_match:
  1.0 if dominant_noise === implied_noise
  0.5 if one step away (Silent<->Quiet or Quiet<->Vibrant)
  0.0 if two steps away (Silent<->Vibrant)

vibe_match:
  1.0 if dominant_vibe === implied_vibe
  0.5 if one step away (Focused<->Casual or Casual<->Social)
  0.0 if two steps away (Focused<->Social)

Level order:
  Noise:  silent -> quiet -> vibrant
  Vibe:   focused -> casual -> social

base_score = (noise_match + vibe_match) / 2
```

### Step 3 — Blend in place quality

```
place_quality = avg_overall_rating / 5.0

match_score = (base_score * 0.7) + (place_quality * 0.3)

match_score_percent = Math.round(match_score * 100)
```

If `rating_count < 1` or `avg_overall_rating` is null, return `match_score_percent: null`.

**Match score color tiers** (used by MatchRing, map pins, and any other score display):
- 70–100 → `status-high` (green)
- 50–69 → `status-medium` (yellow)
- 0–49 → `status-low` (red)
- null → gray ("--")

### Dominant label logic

For each metric, the dominant label is the level with the highest count in place_stats. Ties use the middle value. When `rating_count = 0`, all dominant labels are null.

```
dominant_noise:
  max(noise_silent, noise_quiet, noise_vibrant) -> return that level
  tie -> 'quiet'

dominant_vibe:
  max(vibe_focused, vibe_casual, vibe_social) -> return that level
  tie -> 'casual'

dominant_tables:
  max(tables_limited, tables_mixed, tables_plentiful) -> return that level
  tie -> 'mixed'

dominant_outlets:
  max(outlets_scarce, outlets_some, outlets_ample) -> return that level
  tie -> 'some'
```

---

## 8. Location

The server never stores or defaults the user's location. `lat` and `lng` are always sent by the client on each request. If either is missing or invalid, return `400 { error: 'lat and lng are required' }`.

The client handles the fallback:

- Live device location available → send real coordinates, show "Near you"
- Location unavailable → send Annandale, VA fallback (lat: 38.8304, lng: -77.1941), show "Annandale, VA"

Both the feed and the map use the same fallback center.

---

## 9. Opening Hours Logic

Derive from `places.opening_hours` (jsonb, Google format) + `places.timezone`. If `timezone` is null, default to `America/New_York`. This default is acceptable for MVP because the entire launch area is in Eastern Time.

Derive:

- `open_now`: boolean — is the place currently open
- `closes_at`: string — e.g. "9:00 PM"
- `closing_soon`: boolean — closes within 30 minutes
- `open_now` filter chip: include place only if `open_now = true`

---

## 10. Google Places API

Server-side only. Never called from the client or exposed to the browser.

```
GET https://places.googleapis.com/v1/places/{place_id}
```

Fields to request when enriching a new place:

- `displayName` → `name`
- `formattedAddress` → `address`
- `location.latitude` → `lat`
- `location.longitude` → `lng`
- `primaryType` → map to `place_type` enum (cafe, library, bookstore)
- `photos[0].name` → `google_photo_ref`
- `regularOpeningHours` → `opening_hours`
- `utcOffsetMinutes` → derive `timezone`
- `goodForChildren`, `amenities.freeWifi` → `has_wifi`

Photo serving:

```
GET https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key=API_KEY
```

Serve via `/api/places/[id]/photo` — redirect or proxy. Never store the resulting URL in the database.

---

## 11. Storage — user-photos

Bucket name: `user-photos`
Path format: `user-photos/{place_id}/{user_id}-{timestamp}.jpg`

Rules:

- Public read — no signed URLs needed
- Authenticated upload only — storage policy checks that `user_id` segment of the path matches `auth.uid()`
- Users can delete only files where their `user_id` appears in the path
- Upload happens after the rating row is inserted — never before
- When a user re-rates a place: delete old `photo_path` from storage, then upload new photo, then update `ratings.photo_path`
- Client-side compression before upload (use `browser-image-compression`) — max 1200px wide
- Client-side validation: jpg or webp only, max 5MB (server-side enforcement is post-MVP)

---

## 12. File and Route Structure

```
middleware.ts                          session check, redirect unauthenticated
app/
  (auth)/
    login/page.tsx                     Google sign-in screen
    auth/callback/route.ts             OAuth callback, update profile name/avatar
  (app)/
    feed/page.tsx                      feed + map tabs
    places/[id]/page.tsx               place detail, rating form, save button
    places/new/page.tsx                add place flow (search then submit)
    saved/page.tsx                     saved places list
    profile/page.tsx                   profile, activity stats, log out
api/
  feed/route.ts                        GET feed
  places/route.ts                      POST new place
  places/search/route.ts               GET search
  places/[id]/route.ts                 GET place detail
  places/[id]/photo/route.ts           GET photo proxy
  places/[id]/rate/route.ts            POST upsert rating
  saved/route.ts                       POST save place
  saved/[place_id]/route.ts            DELETE unsave place
  user/preferences/route.ts            PATCH radius
supabase/
  migrations/                          all schema changes versioned here
  seed.sql                             initial NoVA place data
```

---

## 13. Migration Strategy

All schema changes go in `/supabase/migrations/`. Never edit a migration after it has been pushed. Write a new migration to alter existing tables.

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <your-project-ref>

npx supabase migration new <descriptive_name>
# write SQL in the generated file
npx supabase db push
```

The initial migration must include:

- All extensions (cube, earthdistance)
- All enums
- All table definitions with constraints and foreign keys
- All indexes
- All RLS policies
- The place_stats trigger
- The profile creation trigger
- The ratings_public view with correct grants

Seed data goes in `/supabase/seed.sql`, not in migrations.

---

## 14. Rate Limits

All checks live in route handlers. There is no alternate write path.

| Action             | Limit                    | Response |
| ------------------ | ------------------------ | -------- |
| Place submissions  | 5 per user per UTC day   | 429      |
| Rating submissions | 100 per user per UTC day | 429      |

Check pattern:

```typescript
const count = await supabaseServiceRole
  .from("ratings")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .gte("created_at", startOfTodayUTC);

if (count >= LIMIT) {
  return NextResponse.json({ error: "..." }, { status: 429 });
}
```

---

## 15. Beta Launch Checklist

Before inviting any testers:

- [ ] Run all migrations against production Supabase project
- [ ] Confirm `ratings_public` view has correct grants (authenticated only, not anon)
- [ ] Confirm raw `ratings` table has SELECT revoked from authenticated role
- [ ] Seed all NoVA places via `seed.sql`
- [ ] Personally rate every seeded place (minimum 1 rating per place so match scores show from day one)
- [ ] Confirm `place_stats` rows exist for every seeded place with correct counts
- [ ] Confirm `has_wifi` populated correctly from Google Places API for seeded places
- [ ] Confirm service role key is not present in any client bundle
- [ ] Confirm Google Places API key is not present in any client bundle
- [ ] Test location fallback with location permission denied (should show Annandale, VA)
- [ ] Test rating form end-to-end including photo upload
- [ ] Test that rating an inactive place returns 400
- [ ] Test that saving an inactive place returns 400

---

## 16. What Is Explicitly Out of Scope for MVP

Do not implement these. They are post-MVP.

- Onboarding flow — no setup screen, radius defaults to 5 miles
- Vibe, noise, outlet preferences stored in user_preferences — preferences are inferred from positively-rated (4+ star) venues only
- Wifi as a rated metric — has_wifi is a place attribute set from Google API, not user-rated
- Overall rating displayed publicly as a community score — it feeds the match score internally only
- Bookstores filter chip — bookstore is a valid place_type but has no feed chip
- Open late filter chip — replaced by Open now
- Pills / feature tags on ratings
- Visit history table
- Multiple saved lists
- Real-time subscriptions
- Geo-fence on place submissions
- Server-side photo size/format enforcement
- Database-level inactive place enforcement (route handler only for MVP)
- Manual place deduplication (fuzzy matching)
- google_photo_attribution display
- Account self-deletion flow
- Incremental place_stats trigger updates
