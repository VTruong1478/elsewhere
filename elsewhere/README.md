# Elsewhere App

This directory contains the Next.js App Router application for Elsewhere.

See the repository root `README.md` for the full technical overview, service architecture, environment variable list, and public-repo notes.

## Directory Map

```text
app/          App Router pages, layouts, and route handlers
components/   UI and domain components for feed, map, places, ratings, auth
hooks/        Browser hooks
lib/          Supabase clients, server helpers, analytics, domain utilities
scripts/      Maintainer-only seed/backfill/data cleanup scripts
store/        Zustand client state
types/        Shared TypeScript types
```

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - start the local Next.js dev server
- `npm run build` - create a production build
- `npm run start` - serve the production build
- `npm run lint` - run ESLint

## Runtime Integrations

- Supabase for auth, Postgres, RLS-backed data access, and Storage
- Mapbox GL for maps
- Google Places API through server-side route handlers
- TanStack Query for client data fetching/mutations
- PostHog analytics when configured
