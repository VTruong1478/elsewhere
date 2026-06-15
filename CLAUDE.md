# CLAUDE.md — Elsewhere

Elsewhere is a place-discovery app for work-friendly venues (cafes, libraries, bookstores, tea shops) in Northern Virginia. Users browse a personalized feed and map, rate venues on noise/vibe/tables/outlets, save favorites, and submit missing places.

**Before writing any code, read this file in full.**

---

## Development Philosophy

- Think before coding. Understand the existing pattern before introducing a new one.
- Read the relevant source files first. Never assume how something works.
- Prefer modifying existing abstractions over creating new ones.
- Make the smallest change that solves the problem. Avoid scope creep.
- Never bypass architecture for convenience (e.g. don't call the DB from a Client Component to avoid writing a route handler).

---

## How to Work

- Search the codebase before writing any utility, hook, or component. An equivalent likely exists.
- Reuse `lib/`, `components/ui/`, and existing hooks before creating anything new.
- When a change touches architecture (new route, new table access pattern, new auth flow), explain the decision before implementing.
- Match the conventions in the file you're editing — formatting, naming, response shape, error handling.
- If something feels overly complex, it probably is. Ask before building it.

---

## Architecture Rules

**Business logic lives in `lib/` or route handlers — never inline in components.**

**Database access:**
- Client Components: never touch the DB directly. Use `fetch()` to call API routes.
- Server Components / route handlers: use `lib/supabase/server.ts` for user-scoped reads.
- Route handlers performing writes or cross-user reads: use `lib/supabase/service-role.ts`.
- Never import `service-role.ts` into Client Components (it's `server-only`).

**Server vs Client Components:**
- Default to Server Components. Add `"use client"` only when needed (interactivity, browser APIs, Zustand, TanStack Query hooks).
- `mapbox-gl` must be used in a Client Component. Never statically import it server-side.

**API routes:**
- All mutations go through `app/api/` route handlers. No client-side direct DB writes.
- Response shape is always `{ data, error }`. Match this exactly.
- Authenticate with `supabase.auth.getUser()` — never trust headers or cookies directly.

**State management:**
- Server state (feed, place detail): TanStack Query.
- Map/list selection sync: Zustand (`store/usePlaceStore.ts` — `selectedPlaceId`, `hoveredPlaceId`).
- Pending auth actions: `sessionStorage` via `lib/gatedAction.ts`.
- Do not add new global state stores without strong justification.

---

## Coding Style

- Readability over cleverness. If a line needs a comment to explain what it does, rewrite it.
- Use early returns to reduce nesting. Validate and bail out at the top of functions.
- Name things explicitly. `handleSavePlace` beats `handleClick`. `isLoadingFeed` beats `loading`.
- Avoid unnecessary abstractions. Don't wrap something in a helper unless it's used in 3+ places.
- Keep functions focused. If a function is doing two distinct things, split it.
- All route handlers return `NextResponse.json({ data, error })`. Do not deviate from this shape.

---

## File & Code Creation Rules

- Do not create a new hook, util, component, or type until you've confirmed an equivalent doesn't exist in `lib/`, `hooks/`, `components/ui/`, or `types/`.
- Extend existing code when the change is cohesive. Add a case to an existing utility rather than creating a parallel one.
- New files go in the existing domain folder (`components/feed/`, `lib/`, etc.) — don't invent new top-level directories.
- Scripts in `scripts/` are maintainer-only. Never call them from app code.

---

## Git Hygiene

- Only modify files directly related to the task. Do not reformat unrelated code.
- Preserve comments unless they are factually wrong. Do not "clean up" comments speculatively.
- Do not change indentation or whitespace in files you're not otherwise editing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, App Router |
| Language | TypeScript 5, React 19 |
| Database | Supabase (Postgres 17) |
| Auth | Supabase Auth — email/password + Google OAuth |
| Styling | Tailwind CSS v3 with custom design tokens |
| Map | `mapbox-gl` (primary). `@vis.gl/react-google-maps` is installed but secondary |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Analytics | PostHog |
| Deployment | Vercel (`iad1`) |

All app code is in `elsewhere/` (the Next.js root). Do not touch `elsewhere-landing/` unless explicitly asked. Planning docs at the monorepo root (`backend-plan.md`, `frontend-plan.md`) are authoritative — read them before making schema or API changes.

---

## Auth

**Provider:** Supabase Auth. `NEXTAUTH_SECRET` is required by `lib/env.ts` but is not used for NextAuth — it's a production security check. Do not remove it.

**Middleware** (`middleware.ts`) refreshes sessions on every request and redirects unauthenticated users to `/signup?next=<path>` (not `/login`). Public paths include `/feed`, `/map`, `/places/[id]` — but NOT `/places/[id]/rate`.

**Three Supabase clients — use the right one:**
- `lib/supabase/client.ts` — browser only, Client Components
- `lib/supabase/server.ts` — Server Components and route handlers, user-scoped
- `lib/supabase/service-role.ts` — route handlers only, bypasses RLS (`server-only`)

**Gated actions** (save/rate/upload photo) when unauthenticated:
1. `ensureAuthForGatedAction()` stores the pending intent in `sessionStorage`
2. Redirects to `/signup?next=<returnPath>`
3. `ResumePendingGatedActions` component resumes the action after auth completes

**Dev auth** (local only, requires `DEV_AUTH_EMAIL` + `DEV_AUTH_PASSWORD`): sets a `dev_auth` cookie; middleware accepts it; route handlers call `tryGetOrCreateDevAuthUser()`. Never reference dev auth patterns in production code paths.

---

## Data & Schema

Read `supabase/schema-dev.sql` for the authoritative column names and types. There is no generated `database.types.ts` — types are hand-written in `types/` and inline in route handlers. Schema drift is a real risk; check migrations before assuming a column exists.

**Core tables:**
- `places` — venue data. Never write from client. Set `is_active = false` to deactivate; never hard-delete.
- `place_stats` — aggregated rating counts, managed entirely by Postgres triggers. Never write directly.
- `ratings` — one row per user per place. Upserted via `POST /api/places/[id]/rate`.
- `saved` — user saves. Use this table. The `favorites` table exists in the schema but is dead code — do not write to it.
- `profiles`, `user_preferences` — one row per user, auto-bootstrapped on signup.
- `place_submissions` — user-submitted missing places; `submitter_name`/`submitter_avatar_url` are denormalized at write time.

**Enum values** (current, post-migration):
- `place_type`: `cafe`, `library`, `bookstore`, `tea_shop`
- `noise_level`: `silent`, `quiet`, `vibrant`
- `tables_label`: `limited`, `mixed`, `plentiful`
- `outlets_label`: `scarce`, `some`, `ample`

**Enum fallback warning:** Early migrations used `ideal`, `none`, `focus`. Legacy rows with old values may still exist. Fallback handling in `feedItemsFromPlaces.ts` and `saved/route.ts` exists for this reason — do not remove it.

**Feed RPC:** `get_feed_places` is called from `GET /api/feed` via service role. Raw rows must go through `buildFeedItemsFromPlaces()` in `lib/feedItemsFromPlaces.ts` to produce `FeedItem[]`. Never construct `FeedItem` objects manually.

**Feed sort order:** match score DESC → distance ASC → rating count DESC. Match score = 70% preference alignment + 30% community quality (`avg_overall_rating`). Cold-start users (no preferences) use community quality only.

---

## Key Conventions

**Tailwind:**
- Use custom design tokens, not default Tailwind colors. Primary = `bg-primary` / `text-primary` (`#4F5D3F`).
- Typography: `.text-display-*`, `.text-heading-*`, `.text-body-*`, `.text-label-*` — not default Tailwind text classes.
- Desktop breakpoint: `min-[1025px]:` — not `lg:` (which is 1024px).

**Photos:**
- `places.google_photo_ref` is a reference string, never a URL. Always proxy through `GET /api/place-photo?ref=...`.
- User photos are stored in Supabase Storage (`user-photos` bucket). Serve via `GET /api/storage/user-photos/...`. Never expose the raw storage URL.
- Vibe photo priority: `vibe_photo_path` (admin-set user upload) → `vibe_photo_ref` (admin-set Google ref) → `google_photo_ref` (default).
- Photo upload is two steps: `POST /api/places/[id]/upload-photo` returns a path, then `PATCH /api/places/[id]/rate` attaches it. Max 6 photos per rating.

**Serialization:** Postgres `bigint` columns must be cast with `Number()` before `NextResponse.json()` — otherwise JSON serialization breaks silently.

**Path alias:** Use `@/` for all imports from the app root (e.g. `@/lib/supabase/server`).

**Location fallback:** When geolocation is denied or the user is outside NoVA, the app defaults to `{ lat: 38.8304, lng: -77.1941 }` (Annandale, VA). This is intentional.

**Rate limit:** 100 ratings per user per UTC day, enforced in `POST /api/places/[id]/rate`.

---

## Environment Variables

```
# Required — app will not start without these
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
NEXTAUTH_SECRET                  # or AUTH_SECRET

# Required for maps
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
NEXT_PUBLIC_MAPBOX_STYLE

# Optional — analytics
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST

# Optional — admin and dev
ELSEWHERE_ADMIN_EMAILS           # comma-separated admin emails
DEV_AUTH_EMAIL
DEV_AUTH_PASSWORD

# Optional — scripts / local DB
DATABASE_URL
DIRECT_URL
SUPABASE_DB_PASSWORD
LOCAL_SUPABASE_DATABASE_URL
```

Copy `.env.example` to `.env.local`. Never commit `.env.local`.

---

## Before You Finish

Check all of the following before considering a task done:

- [ ] No TypeScript errors introduced (`npm run build` or tsc)
- [ ] No duplicated logic — search for similar utilities before leaving new ones in place
- [ ] API responses match `{ data, error }` shape
- [ ] Correct Supabase client used (browser vs server vs service role)
- [ ] No `bigint` values passed raw to `NextResponse.json()`
- [ ] Auth checks present on all protected route handlers
- [ ] Tailwind uses custom tokens, not default colors; breakpoint is `min-[1025px]:` not `lg:`
- [ ] No new files created when extending an existing file would suffice
- [ ] No unrelated files modified
