# Elsewhere

Elsewhere is a location-aware web app for finding places to work outside the house: cafes, libraries, tea shops, bookstores, and other third places with useful workability signals.

It is currently focused on Northern Virginia, with Annandale as the fallback center when a user has not shared location or is outside the active service area.

## Product Surface

- Nearby feed with search, place-type filters, location status messaging, and personalized match scores
- Full-screen map and desktop split-pane map/list layout
- Custom Mapbox markers for scored/unscored places, selected places, and user location
- Place detail sheets/panels with photos, hours, rating aggregates, notes, save/rate CTAs, and share actions
- Rating flow for noise, vibe, tables, outlets, overall workability, tips, and user-uploaded photos
- Saved places
- User onboarding/tutorial and gated auth return flows
- Admin-only vibe photo selection tooling

## Repository Layout

```text
/
├── elsewhere/       # Next.js application
│   ├── app/         # App Router pages, layouts, route handlers
│   ├── components/  # UI, feed, map, places, rating components
│   ├── hooks/       # Client hooks
│   ├── lib/         # Supabase clients, domain logic, helpers
│   ├── scripts/     # Maintainer data/backfill scripts
│   ├── store/       # Zustand client state
│   └── types/       # Shared TypeScript types
├── supabase/        # Supabase migrations and schema snapshots
├── backend-plan.md  # Backend/product implementation notes
└── frontend-plan.md # Frontend/design implementation notes
```

## Tech Stack

### App

- **Framework:** Next.js App Router (`next@16`)
- **Runtime/UI:** React 19, TypeScript
- **Styling:** Tailwind CSS v3 with project tokens in `elsewhere/tailwind.config.js`
- **Fonts:** Lora for headings/display, DM Sans for body/UI via `next/font`
- **Client state:** Zustand for selected/hovered place state
- **Server/client async state:** TanStack Query v5

### Data and Services

- **Database/Auth/Storage:** Supabase
  - Postgres for places, ratings, saves, preferences, stats, and submissions
  - Supabase Auth for user sessions and Google OAuth
  - Supabase Storage for user-uploaded rating photos
- **Maps:** Mapbox GL JS for the interactive map surface
- **Place enrichment:** Google Places API through server-side route handlers
- **Analytics:** PostHog, enabled only when public env vars are configured
- **Hosting:** Vercel, configured in `elsewhere/vercel.json`

## Architecture Notes

- The app is primarily client-rendered inside the App Router shell. Server route handlers provide mutations and protected data access.
- Supabase browser clients use anon credentials and RLS. Service-role access is restricted to server-only modules and route handlers.
- `GET /api/feed` calls a Supabase RPC (`get_feed_places`) through the service role, then shapes rows into `FeedItem` objects in `elsewhere/lib/feedItemsFromPlaces.ts`.
- Place photos from Google are proxied through server routes instead of storing permanent Google photo URLs.
- User-uploaded rating photos are normalized client-side, uploaded through `POST /api/places/[id]/upload-photo`, then attached to the rating with `PATCH /api/places/[id]/rate`.
- The map/list/detail selection state is shared through `elsewhere/store/usePlaceStore.ts`.
- Admin vibe-photo updates require an authenticated admin user (`app_metadata.role === "admin"`, `app_metadata.roles` containing `"admin"`, or an email listed in `ELSEWHERE_ADMIN_EMAILS`).

## Local Development

```bash
cd elsewhere
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Scripts

From `elsewhere/`:

```bash
npm run dev          # Start Next dev server
npm run build        # Production build
npm run start        # Serve production build
npm run lint         # ESLint
npm run seed-places  # Maintainer-only Google Places/Supabase seed helper
```

## Environment Variables

Use `elsewhere/.env.example` as the source of truth for local setup. Do not commit real values.

Required for normal app behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`

Optional:

- `NEXT_PUBLIC_MAPBOX_STYLE`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `ELSEWHERE_ADMIN_EMAILS`
- `DEV_AUTH_EMAIL` and `DEV_AUTH_PASSWORD` for local-only development login
- database helper variables for one-off scripts

## Database

Supabase migrations and schema snapshots live under `supabase/`. The app expects:

- `places` and `place_stats` for place data and cached rating aggregates
- `ratings` for user workability ratings and photo paths
- `saved` for saved places
- `profiles` and `user_preferences` for user identity/preferences
- `place_submissions` for user-submitted missing places

The feed path depends on a `get_feed_places` RPC and rating aggregate triggers in the Supabase schema. Review the migrations before bootstrapping a new database.

## Maintainer Scripts

Scripts under `elsewhere/scripts/` are operational helpers for seeding, backfilling, and one-off data cleanup. They can use service-role credentials, Google Places credentials, and direct database URLs. Treat them as maintainer-only tools and run them only with intentional environment configuration.

## Public Repo Notes

This repository intentionally ignores local environment files, Supabase CLI temp state, Supabase branch state, and one-off script outputs. Real secrets should live in `.env.local` for local development and in Vercel/Supabase project settings for deployed environments.

If the repository has ever contained credentials or local Supabase project state in Git history, rotate affected credentials and rewrite history before making the repository public.
