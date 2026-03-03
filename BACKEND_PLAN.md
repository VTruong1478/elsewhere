# Elsewhere — Backend Plan & Endpoint Outline

Mobile-first web app for discovering third spaces (cafes, libraries) in Atlanta. Google sign-in required; feed-first, location-based recommendations.

---

## 1. Architecture Overview

- **Auth:** Supabase Auth (Google OAuth). All app routes except sign-in/sign-up and auth callbacks require a session; redirect unauthenticated users to sign-in.
- **Data:** Supabase Postgres + Row Level Security (RLS). No separate API service; use Supabase client from Next.js (server components + route handlers where server-only work is needed).
- **External API:** Google Places API used **server-side only** (Next.js Route Handlers or Server Actions) for:
  - Looking up/searching places when a user submits a new place.
  - Enriching new places (name, address, lat/lng, photo reference) before saving to DB.
  - Serving place photos: photos are **not** stored as permanent URLs. The app stores a photo reference; when a place image is needed, the server redirects to the Google Places Photo URL or proxies/streams the image. Attribution must be displayed when required. This keeps usage compliant with Google’s terms.
- **Match score:** Computed at read time for the feed and map using cached `place_stats`, distance, and user preferences. **Confidence-aware:** when `rating_count` is low, the score is dampened toward a neutral baseline and the UI shows only “Not enough data” (never use “Mixed” as a low-data fallback; “Mixed” is reserved for the Tables level and vibe option). Feed and map responses include match score as a percentage plus 2–3 “why matched” reasons (optional but recommended) for cards and map pins.
- **UI metrics (exact labels):** Noise: Silent / Quiet / Vibrant. Tables: Limited / Mixed / Ideal. Outlets: None / Limited / Ample. DB stores lowercase enum values; UI displays title-case. Tables use a 5-dot UI on the frontend only (Limited = 1 filled dot, Mixed = 3, Ideal = 5); backend stores only the categorical level (limited/mixed/ideal).

---

## 2. Database Schema

### 2.1 Tables

| Table | Purpose |
|-------|--------|
| `profiles` | One row per user; minimal identity and onboarding state. |
| `user_preferences` | One row per user; radius, noise, outlets, wifi, vibe preferences. |
| `places` | Venues (cafes, libraries). Key fields from Google or manual submit; photo stored as reference only; opening hours in jsonb for “Open until” / “Closing soon” / “Open late”. |
| `place_stats` | Cached aggregates per place (noise/tables/outlets/vibe category counts, rating_count, optional avg wifi). Updated by trigger on ratings insert/update/delete. One row per place; created empty on place creation. |
| `ratings` | User-submitted ratings per place (noise, tables, outlets, wifi, vibe, pills array). One current rating per user per place (upsert). DB enums **lowercase**; UI displays title-case (e.g. Silent, Quiet, Vibrant; Limited, Mixed, Ideal; None, Limited, Ample). |
| `favorites` | User–place saves (favorites only; no lists). |

### 2.2 `profiles`

- `id` (uuid, PK, FK → `auth.users.id`)
- `onboarding_completed_at` (timestamptz, nullable until onboarding done)
- `created_at`, `updated_at`

RLS: users can read/update only their own row.

### 2.3 `user_preferences`

- `user_id` (uuid, PK, FK → `auth.users.id`)
- `radius_miles` (numeric, e.g. 1–25)
- `noise_preference` (enum: `silent` | `quiet` | `vibrant`) — UI: “Silent”, “Quiet”, “Vibrant”.
- `needs_outlets` (boolean)
- `needs_wifi` (boolean)
- `vibe_preference` (enum: `focus` | `mixed` | `social` | `any`)
- `created_at`, `updated_at`

RLS: users can read/update only their own row. Onboarding creates/updates both `profiles` and `user_preferences`.

### 2.4 `places`

- `id` (uuid, PK)
- `google_place_id` (text, unique, nullable for manual-only places)
- `name` (text)
- `address` (text)
- `lat`, `lng` (numeric)
- `place_type` (text, e.g. `cafe`, `library`) — used for filter chip “Libraries”; also for MVP “Free” (library/public = free; cafes = low-cost, not “free”).
- `google_photo_ref` (text, nullable) — Google’s photo reference for the Places Photo API; **do not** store a permanent photo URL (terms compliance).
- `google_photo_attribution` (text, nullable) — optional attribution text to display when showing the photo.
- `opening_hours` (jsonb, nullable) — Google opening hours data (e.g. weekday_text or periods). Server uses this to derive `open_now`, `closes_at`, and “closing soon” state.
- `timezone` (text, nullable) — IANA timezone (e.g. `America/New_York`) for interpreting opening hours. **MVP (Atlanta-only):** if `places.timezone` is null or missing, default to `America/New_York` when deriving open_now, closes_at, closing_soon, open_late; this is acceptable because the MVP is Atlanta-only.
- `created_at`, `updated_at`
- Optional: `created_by` (uuid → auth.users) for “submitted by” and moderation.

**Photos:** When the app needs to show a place image, a server route (or Server Action) calls the Google Places Photo endpoint with `google_photo_ref`, then redirects to the Google Places Photo URL or proxies/streams the image. Display attribution when required. No long-lived photo URLs stored in DB.

**Opening hours (cards and “Open late” chip):** Server derives from `opening_hours` + `timezone`: (1) **open_now** — whether the place is currently open. (2) **closes_at** — time today when it closes (e.g. “Open until 9pm”, “Closing soon (9pm)”). (3) **Closing soon** — e.g. closing within 30–60 minutes; threshold is configurable. (4) **Open late** — for the filter chip and “Open late” pill: e.g. closes at or after a set hour (e.g. 10pm or 11pm); can be computed from `opening_hours` or stored as a derived boolean/cache if needed for filtering.

RLS: all authenticated users can read. **Insert/update only via server route handlers using the service role** (validation + dedupe). No direct client insert to `places` for MVP.

### 2.5 `place_stats`

Cached aggregates per place to support fast feed and map rendering. One row per place (1:1 with `places`). **A row must exist for every place:** on place creation or seed, upsert an empty `place_stats` row for that `place_id` with `rating_count=0` (and zero category counts). All three metrics use **three-level category counts** aligned to UI labels (Noise: Silent/Quiet/Vibrant; Tables: Limited/Mixed/Ideal; Outlets: None/Limited/Ample).

- `place_id` (uuid, PK, FK → places)
- `rating_count` (integer, default 0) — number of ratings for this place.
- `noise_silent` (integer, default 0), `noise_quiet` (integer, default 0), `noise_vibrant` (integer, default 0) — counts per noise level (UI: Silent, Quiet, Vibrant).
- `tables_limited` (integer, default 0), `tables_mixed` (integer, default 0), `tables_ideal` (integer, default 0) — counts per category (UI: Limited, Mixed, Ideal).
- `outlets_none` (integer, default 0), `outlets_limited` (integer, default 0), `outlets_ample` (integer, default 0) — counts per category (UI: None, Limited, Ample).
- `avg_wifi` (numeric, nullable) — average of `ratings.wifi_rating` where not null (optional 1–5 display).
- `vibe_focus` (integer, default 0), `vibe_mixed` (integer, default 0), `vibe_social` (integer, default 0) — counts per vibe (from `ratings.vibe` where not null).
- `updated_at` (timestamptz)

**Dominant level for display:** For feed cards and detail, derive the displayed label (e.g. “Quiet”, “Ample”) by taking the mode (highest count) from the relevant category counts. For Tables use Limited/Mixed/Ideal; for vibe use focus/mixed/social. When `rating_count` is low, show **“Not enough data”** only—do not use “Mixed” as a low-data fallback; reserve “Mixed” for the Tables level (Limited/Mixed/Ideal) and the vibe option (focus/mixed/social).

**Maintenance:** Updated automatically when ratings change. **Postgres trigger** on `ratings` that fires after INSERT, after UPDATE, and after DELETE (because ratings are upserted, so both insert and update occur). The trigger recomputes stats for the affected `place_id` and upserts the corresponding `place_stats` row. Alternative: an Edge/Route Handler invoked after rating mutations that recomputes and updates `place_stats` via service role. For MVP, trigger keeps the feed fast without extra application logic.

RLS: all authenticated users can read. Only the trigger (or server with service role) can insert/update; no client write.

### 2.6 `ratings`

- `id` (uuid, PK)
- `place_id` (uuid, FK → places)
- `user_id` (uuid, FK → auth.users)
- `noise` (enum: `silent` | `quiet` | `vibrant`) — DB lowercase; UI: “Silent”, “Quiet”, “Vibrant”.
- `tables_label` (enum: `limited` | `mixed` | `ideal`) — DB lowercase; UI: “Limited”, “Mixed”, “Ideal”. Frontend may show 5-dot display (1 = Limited, 3 = Mixed, 5 = Ideal); backend stores only the category.
- `outlets_label` (enum: `none` | `limited` | `ample`) — DB lowercase; UI: “None”, “Limited”, “Ample”.
- `wifi_rating` (smallint 1–5, nullable)
- `vibe` (enum: `focus` | `mixed` | `social`, nullable) — DB lowercase; UI displays capitalized.
- `pills` (text[], default '{}') — array of pill keys selected by the user for this place (e.g. `study rooms`, `public computers`, `morning rush`, `cozy nooks`). Stored per rating; feed/detail can show aggregated or most-common pills per place (optional aggregation later).
- `notes` (text, nullable)
- `created_at`, `updated_at`
- Unique constraint on `(place_id, user_id)` — one rating per user per place (upsert).

**Pills:** Each rating can include a list of pill keys (`pills` text[]) chosen by the user (e.g. “study rooms”, “public computers”, “morning rush”, “cozy nooks”). **Feed cards MVP rule:** for each place, take the most recent N ratings (N = 20); collect all `ratings.pills` values across those ratings; select the top 2 pill strings by frequency; if there are no pills in the last N ratings, return an empty pills list. This is read-time aggregation for MVP and can be cached later.

RLS: users can insert/update/delete only their own rows; all authenticated users can read.

### 2.7 `favorites`

- `user_id` (uuid, FK → auth.users)
- `place_id` (uuid, FK → places)
- `created_at`
- Primary key `(user_id, place_id)`

RLS: users can read/insert/delete only their own rows.

### 2.8 Feed and detail data source

- **Feed and map:** Join `places` + `place_stats` (and optionally `favorites` for current user). Include per-place: dominant Noise/Tables/Outlets labels from `place_stats` category counts; **open_now**, **closes_at**, **closing_soon** and **open_late** derived from `places.opening_hours` + effective timezone (see timezone default below); **match_score_percent** and 2–3 **why_matched** reasons (optional but recommended); **pills** for cards per the MVP pills rule (see below). No need to aggregate from `ratings` at read time for stats; use cached `place_stats`.
- **Place detail:** Place row + its `place_stats` + current user’s rating (if any) + favorite state + opening-hours-derived fields. For dominant tables, outlets, noise, and vibe labels, derive from category counts in `place_stats` (mode). When `rating_count` is low, UI shows **“Not enough data”** only (never “Mixed” as fallback).

---

## 3. Match Score & Confidence

- **Inputs:** User preferences (from `user_preferences`), user’s current lat/lng, per-place `place_stats`, and distance.
- **Score components (conceptual):**
  - Distance: better when closer (e.g. within radius, decay by distance).
  - Noise: align dominant noise level (from `place_stats` counts: `noise_silent`, `noise_quiet`, `noise_vibrant`) to user’s `noise_preference` (silent/quiet/vibrant); exact match scores highest.
  - Outlets/WiFi: if user needs them, boost places with ample outlets and good avg wifi; penalize none/poor.
  - Vibe: align dominant vibe (from `place_stats` vibe counts: `vibe_focus`, `vibe_mixed`, `vibe_social`) to user’s `vibe_preference`; `any` = no penalty.
- **Confidence handling:** When `place_stats.rating_count` is below a threshold (e.g. 2–3), apply a **dampener**: pull the match score toward a neutral baseline so low-data places don’t rank as overconfident. In the UI, show **“Not enough data”** for places with few ratings (do not use “Mixed” as a low-data fallback).
- **Output:** Single numeric score per place; feed and map sorted by score (e.g. descending). **Display:** Feed and map responses include **match_score_percent** (e.g. 0–100) and 2–3 **why_matched** reasons (optional but recommended) for cards and map pins (e.g. “Quiet”, “Ample outlets”, “Close to you”). Implementation can live in a server-side function or in the feed Route Handler / Server Component after fetching places + place_stats.

---

## 4. Endpoint / Route Outline

Assume **App Router**. Prefer Server Components for read-heavy pages; use Route Handlers for mutations and for any path that must call Google (server-only). **Place insertion is only through server route handlers** (service role, validation + dedupe); users never insert directly into `places` from the client.

### 4.1 Auth

- **Sign-in / Sign-up:** Supabase client-side `signInWithOAuth({ provider: 'google' })`. No custom endpoint unless you need a custom callback URL that then redirects into the app.
- **Callback:** Next.js route that Supabase redirects to after Google sign-in (e.g. `/auth/callback`). Exchange code for session, set cookies, redirect to onboarding or feed.
- **Middleware:** On all non-public routes (everything except sign-in, sign-up, auth callback, and static assets), check for Supabase session; redirect to sign-in if missing.

### 4.2 Onboarding

- **Read:** Server Component or server-side fetch of `profiles` and `user_preferences` for current user. If no profile or `profiles.onboarding_completed_at` is null, show onboarding.
- **Write:** Client updates `profiles` and `user_preferences` via Supabase client (RLS allows only own rows), or a single `PATCH /api/user/preferences` (or Server Action) that validates and upserts both tables. On completion, set `profiles.onboarding_completed_at`.

### 4.3 Feed (and map data)

- **Read:** Server Component or `GET /api/feed` with query params:
  - **`lat`, `lng`** (required for distance) — user’s location.
  - **`q`** (optional) — search query; filters by place name and/or address (e.g. SQL `ILIKE` on `places.name` and `places.address`, or full-text search). Only places matching `q` (when provided) are returned.
  - **Filter chips (optional):** `filter` or dedicated params (e.g. `quiet`, `free`, `libraries`, `open_late`) — see below.
- **Behavior:**
  - Load user preferences from `user_preferences` (and profile if needed).
  - Fetches places within radius joined with `place_stats` (and optionally `places.opening_hours`/effective timezone for open-now/closing-soon/open-late). **Distance filtering (MVP):** use Postgres **earthdistance** in SQL only; no bounding-box + haversine in app code. **Prerequisite:** enable Supabase Postgres extensions `cube` and `earthdistance` (earthdistance depends on cube).
  - Apply search `q` when present (name/address filter).
  - Apply filter chip logic when present.
  - Compute match score (confidence-aware using `rating_count`) and sort. Derive per-place: open_now, closes_at, closing_soon, open_late from `opening_hours` + timezone.
  - Return payload includes for each place: place fields, `place_stats`-derived dominant labels (Noise: Silent/Quiet/Vibrant; Tables: Limited/Mixed/Ideal; Outlets: None/Limited/Ample), **match_score_percent**, 2–3 **why_matched** reasons, opening state (“Open until Xpm”, “Closing soon (Xpm)”, “Open late” chip), and **pills** for cards per the MVP rule (most recent 20 ratings, top 2 pills by frequency, or empty if none).
- **Pagination:** Optional `limit`/`offset` or cursor; MVP can use a fixed limit (e.g. 20).

**Filter chips (UI: All spots, Quiet, Free, Libraries, Open late):**

| Chip       | Source / logic |
|------------|-----------------|
| **All spots** | No filter; show all places in radius (subject to `q` if present). |
| **Quiet**   | Filter by dominant noise level from `place_stats`: include places where dominant noise is `quiet` (e.g. `noise_quiet` is the max of noise_silent/quiet/vibrant). |
| **Free**    | MVP: “Free” = library and other public spaces. Filter by `place_type` (e.g. `place_type = 'library'` or allow a small set of free types). Cafes are low-cost but not “free”; do not include in Free chip. |
| **Libraries** | Filter by `place_type = 'library'`. |
| **Open late** | Filter by opening hours: place closes at or after a threshold hour (e.g. 22:00 or 23:00) on at least one day; derive from `places.opening_hours` (and `timezone`) or from a cached/computed field if needed for performance. |

### 4.4 Place detail

- **Read:** Server Component or `GET /api/places/[id]` returning: place row (with `google_photo_ref`/attribution; no permanent photo URL), its `place_stats`, current user’s rating (if any), and whether the user has favorited the place. When `rating_count` is low, UI shows **“Not enough data”** only.
- **Photo:** When the UI needs the place image, call a server route (e.g. `GET /api/places/[id]/photo`) that uses `google_photo_ref` to redirect to the Google Places Photo URL or proxy/stream the image. Display attribution when required. No permanent photo URL stored.
- **Submit rating:** Client inserts/upserts into `ratings` via Supabase (RLS allows only own row). Trigger (or alternative handler) updates `place_stats`. Request body uses **lowercase** enum values: `noise` (silent|quiet|vibrant), `tables_label` (limited|mixed|ideal), `outlets_label`, `vibe`, and optional `pills` (array of strings, e.g. `["study rooms", "cozy nooks"]`).
- **Toggle favorite:** Client insert/delete on `favorites` via Supabase (RLS).

### 4.5 Submit new place

- **Flow:** (1) User searches for the place (name/address). (2) Server checks existing places (by Google Place ID or dedupe rules). (3) If not found, user submits; **insertion into `places` happens only in a server route handler** with validation and dedupe.
- **Search existing:** `GET /api/places/search?q=...` (and optionally `lat`/`lng`). Server-only: call Google Places API (Text Search or Find Place), then for each candidate check if `places.google_place_id` already exists; return list (e.g. “already in DB” vs “can add from Google”).
- **Add place:** `POST /api/places` — **only from server route handler (service role)**. Body: either `{ google_place_id }` (server fetches details from Google, including photo reference, and inserts one row into `places` and upserts an empty `place_stats` row for that place with `rating_count=0`) or `{ name, address, lat, lng, place_type?, ... }` for manual add. Server validates, dedupes (by `google_place_id` or nearby lat/lng), then inserts. **Ensure a `place_stats` row exists for every place on creation/seed.** Do not allow direct client insert to `places` for MVP.

### 4.6 Favorites list

- **Read:** Server Component or `GET /api/favorites` that returns places the current user has in `favorites`, joined with `places` and `place_stats` for display.

---

## 5. Google Places API Usage (Server-Side Only)

- **Keys:** Store in env (e.g. `GOOGLE_PLACES_API_KEY`). Use only in Route Handlers or Server Actions, never in client bundle.
- **Calls:**
  - **Place Details** (by `place_id`) when creating a place from a Google result; store name, address, lat/lng, `place_type`, **photo reference** (and optional attribution), and **opening hours** in `places.opening_hours` jsonb; set `timezone` if available from the API, otherwise leave null (MVP: when interpreting hours, default to `America/New_York` for Atlanta-only). Do not store a permanent photo URL.
  - **Places Photo** endpoint when the app needs to display a place image: server redirects to the Google Places Photo URL or proxies/streams the image using `google_photo_ref`. Attribution must be displayed when required.
  - **Text Search / Find Place** when user searches before adding a new place.
- **Data stored in DB:** For photos, store only `google_photo_ref` and optional `google_photo_attribution`; serve images via redirect or proxy/stream when needed. For hours, store `opening_hours` (jsonb) and `timezone`; when `timezone` is null, use `America/New_York` for MVP (Atlanta-only).

---

## 6. Setup Prerequisites

- **Postgres extensions (required for distance filtering):** Enable the Supabase Postgres extensions **`cube`** and **`earthdistance`** so that radius/distance filtering can use `earth_distance` (or equivalent) in SQL. Do this once in the Supabase project (e.g. Database → Extensions).

---

## 7. RLS Summary

| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| `profiles` | own row | own row | own row | — |
| `user_preferences` | own row | own row | own row | — |
| `places` | all authenticated | **server only (service role)** | **server only (service role)** | — |
| `place_stats` | all authenticated | trigger / server only | trigger / server only | — |
| `ratings` | all authenticated | own row | own row | own row |
| `favorites` | own rows | own row | — | own row |

“Own” = `auth.uid() = user_id` (or `id` for `profiles`). For `places` and `place_stats`, client never inserts or updates; use a Supabase client with service role in Route Handlers (and triggers for `place_stats`).

---

## 8. File / Route Map (Suggestions)

- `middleware.ts` — session check; redirect unauthenticated to sign-in.
- `app/(auth)/login`, `app/(auth)/auth/callback` — sign-in and OAuth callback.
- `app/(app)/onboarding` — onboarding form; reads/updates `profiles` and `user_preferences`.
- `app/(app)/feed` — feed page and map (Server Component or client fetch of `/api/feed`); supports `q`, filter chips; uses `place_stats` for fast render; response includes match_score_percent, why_matched, opening state, pills.
- `app/(app)/places/[id]` — place detail (Server Component + rating/favorite forms). Photo via server route that calls Places Photo API.
- `app/(app)/places/[id]/photo` or `app/api/places/[id]/photo/route.ts` — GET place image from Google using `google_photo_ref`.
- `app/(app)/places/new` — “Add place” flow (search then submit); submission goes to `POST /api/places` only.
- `app/(app)/favorites` — list of saved places.
- `app/api/places/route.ts` — **POST new place only (service role);** validation + dedupe; no client insert to DB.
- `app/api/places/search/route.ts` — GET search (calls Google + DB check).
- `app/api/places/[id]/rate/route.ts` — optional: POST upsert rating (or client + RLS); trigger updates `place_stats`.
- `app/api/favorites/route.ts` — GET list, POST add, DELETE remove (optional; client + RLS is sufficient).

---

## 9. 30-Day MVP Simplifications

- **Geography:** Atlanta-only; no multi-city. **Distance filtering:** MVP uses Postgres earthdistance in SQL only; no bounding-box + haversine in app code. **Prerequisite:** enable Supabase Postgres extensions `cube` and `earthdistance` (see Setup Prerequisites). Optional: store Atlanta bounding box and filter places to that box.
- **Place types:** Fixed set (e.g. cafe, library); no open-ended tags for MVP. **Free** filter = library/public spaces only; cafes are not “free”.
- **Place submission:** Users submit via UI; **all inserts to `places` go through server route handlers** (service role) with validation and dedupe. No direct client insert to `places`. Enrich from Google Place Details (name, address, lat/lng, place_type, photo reference, opening_hours, timezone if available).
- **Ratings:** One rating per user per place (upsert); no rating history. **UI metrics:** Noise = Silent/Quiet/Vibrant; Tables = Limited/Mixed/Ideal; Outlets = None/Limited/Ample. DB enums **lowercase**; UI title-case. Tables: 5-dot UI is frontend-only; backend stores only categorical level. **Low-data labeling:** use only **“Not enough data”** for low-data states; reserve “Mixed” for Tables level (Limited/Mixed/Ideal) and vibe (focus/mixed/social). **Pills:** Stored per rating as `ratings.pills` text[]; for feed cards, MVP rule: most recent 20 ratings per place, collect all pills, top 2 by frequency, or empty list if none—read-time aggregation, can be cached later.
- **Opening hours:** Store in `places.opening_hours` (jsonb) + `places.timezone`. If `timezone` is null, default to `America/New_York` (acceptable for Atlanta-only MVP). Server derives open_now, closes_at, “Closing soon”, “Open late” for cards and filter chip.
- **Feed and map:** Search via `q` (place name/address). Filter chips: All spots, Quiet (from place_stats noise), Free (place_type), Libraries (place_type), Open late (from opening_hours). Response includes match_score_percent, 2–3 why_matched reasons, opening state, and pills per MVP rule (top 2 from last 20 ratings).
- **Favorites:** Single list only; no custom lists or folders.
- **place_stats:** Three-level category counts for noise (silent/quiet/vibrant), tables (limited/mixed/ideal), outlets (none/limited/ample); dominant label = mode. Confidence dampener when rating_count is low; UI shows **“Not enough data”** only for low-data (never “Mixed” as fallback).
- **Photos:** Store only `google_photo_ref` (+ optional attribution); serve images via server route that redirects to or proxies/streams from the Google Places Photo endpoint. Display attribution when required.
- **No real-time:** No Supabase Realtime for MVP; simple refresh or refetch on navigate.

This gives you a corrected, concise backend plan aligned with the Elsewhere feed and map UI and ready to implement in Next.js + Supabase.
