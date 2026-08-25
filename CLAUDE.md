# CLAUDE.md — Elsewhere

Elsewhere is a place-discovery app for work-friendly venues such as cafes, libraries, bookstores, and tea shops. Users browse a personalized feed and map, evaluate places based on noise, vibe, tables, outlets, and photos, save favorites, rate venues, and submit missing places.

**Before writing code, read this file in full.**

## Product Goal

Optimize for one outcome:

> Help users quickly discover a place they genuinely want to work from, feel confident choosing it, and have a reason to use Elsewhere again.

Prioritize:

1. Fast discovery
2. Confidence in what working there will feel like
3. Easy decision-making
4. Excellent mobile UX
5. Visual, polished, trustworthy experiences
6. Useful reasons to return

Do not add features just because competitors have them. Every meaningful feature should improve discovery, confidence, decision-making, or retention.

---

## Act Like a Product Engineer

Do not operate only as a ticket-taking coding assistant.

While working, proactively look for:

- bugs
- confusing UX
- dead ends
- missing loading, empty, and error states
- mobile/responsive problems
- accessibility problems
- unnecessary taps or complexity
- missing or misleading data
- poorly surfaced existing features
- useful product opportunities
- edge cases
- reasons users may abandon or not return

Do not assume existing behavior is intentional or optimal.

If something works technically but is confusing or poorly designed, flag it.

Maintain meaningful findings in:

`docs/PRODUCT_BACKLOG.md`

Do not fill the backlog with speculative feature ideas. Include evidence, impact, proposed solution, priority, effort, and whether my decision is required.

---

## Autonomy

### Fix autonomously

You may investigate, implement, test, and report without asking first for:

- clear bugs
- broken responsive behavior
- accessibility defects
- missing loading/error/empty states
- obvious visual inconsistencies
- malformed or missing-data handling
- small performance fixes
- low-risk UX improvements with an obvious correct behavior
- regressions from the documented design

### Propose before implementing

Ask for a decision before:

- major new features
- significant UX flow changes
- schema changes or migrations
- architecture changes
- new external services or meaningful dependencies
- auth behavior changes
- privacy/security-sensitive behavior
- ranking/recommendation changes
- destructive data operations
- changes that materially alter the visual design

Investigate first. When asking, give me the problem, evidence, recommendation, impact, effort/risk, and exact decision needed.

Do not ask broad questions when you can first form a recommendation.

---

## How to Work

For implementation work:

1. Understand the user journey and reproduce the problem.
2. Read the relevant code and adjacent paths.
3. Search for existing components, hooks, utilities, and patterns.
4. Identify the root cause.
5. Implement the smallest coherent solution.
6. Test the complete affected flow using Claude in Chrome.
7. Test relevant edge cases and mobile behavior.
8. Run appropriate automated checks.
9. Review your own diff as if reviewing another engineer's PR.
10. Fix problems found during self-review.
11. Update `docs/PRODUCT_BACKLOG.md` with completed or newly discovered work.
12. Continue through clearly approved/autonomous work unless a product decision is required.

Do not stop after every small fix merely to ask permission to continue.

---

## End-to-End Testing

**Frontend work is not complete until tested end-to-end using Claude in Chrome.**

Do not rely only on code inspection, TypeScript, lint, tests, or build success.

For affected flows:

- use the real running app
- perform the full user interaction
- verify resulting UI/state
- refresh when persistence matters
- test mobile around 390px
- test desktop above 1025px
- test relevant loading, empty, failure, and missing-data states
- check adjacent behavior for regressions
- inspect browser console/network behavior when relevant

For auth, location, map state, saving, rating, submissions, and uploads, test the complete multi-step journey.

If something cannot be tested in Claude in Chrome, state exactly what remains unverified.

---

## Frontend Is Specification-Driven

I am highly specific about the frontend.

Before changing frontend UI or behavior:

1. Read the relevant parts of `frontend-plan.md`.
2. Read `FRONTEND.md`.
3. Inspect the current implementation.
4. Inspect existing design-system components/tokens.
5. Inspect the rendered experience using Claude in Chrome.

`frontend-plan.md` is authoritative for specified layout, hierarchy, spacing, typography, responsive behavior, and visual treatment.

Do not redesign specified UI based on personal preference.

If you see a meaningful improvement that conflicts with the frontend plan, add it to the backlog and propose it instead of implementing it silently.

Frontend changes should prioritize:

- clear visual hierarchy
- mobile usability
- consistent spacing
- consistent typography
- obvious interactions
- useful imagery
- strong loading/empty/error states
- confidence in venue selection
- minimal layout shift

### Tailwind

Use Elsewhere design tokens, not default Tailwind colors.

Primary:

`bg-primary` / `text-primary`

`#4F5D3F`

Typography:

- `.text-display-*`
- `.text-heading-*`
- `.text-body-*`
- `.text-label-*`

Desktop breakpoint:

`min-[1025px]:`

Do not substitute `lg:`.

Reuse existing UI primitives before creating new ones.

---

## Architecture

All app code is in `elsewhere/`.

Do not touch `elsewhere-landing/` unless explicitly asked.

Read `backend-plan.md` before schema/API changes.

### Business logic

Business logic belongs in `lib/` or route handlers, never inline in components.

### Database

- Client Components never access DB directly. Use API routes.
- Server Components / user-scoped route handlers use `lib/supabase/server.ts`.
- Writes or cross-user reads use `lib/supabase/service-role.ts`.
- Never import service role code client-side.

### Server vs Client

Default to Server Components.

Use `"use client"` only when required for interactivity, browser APIs, Zustand, TanStack Query hooks, etc.

`mapbox-gl` must run client-side.

### API

All mutations go through `app/api/`.

Responses always use:

`{ data, error }`

Authenticate with:

`supabase.auth.getUser()`

### State

- Server state: TanStack Query
- Map/list selection: Zustand via `store/usePlaceStore.ts`
- Pending auth actions: `sessionStorage` via `lib/gatedAction.ts`

Do not add new global stores without strong justification.

---

## Code Quality

- Read before editing.
- Prefer existing abstractions over new ones.
- Search before creating hooks, utilities, components, or types.
- Fix root causes, not symptoms.
- Prefer readability over cleverness.
- Use explicit names and early returns.
- Avoid unnecessary abstractions.
- Keep functions focused.
- Do not reformat unrelated code.
- Do not modify unrelated files.
- Never discard unrelated uncommitted work.
- Review `git status` and the final diff.

Use `@/` imports from the app root.

---

## Auth

Supabase Auth is used.

`NEXTAUTH_SECRET` is required by `lib/env.ts` as a production security check. Do not remove it.

Unauthenticated protected routes redirect to:

`/signup?next=<path>`

Public:

- `/feed`
- `/map`
- `/places/[id]`

Protected:

- `/places/[id]/rate`

Supabase clients:

- browser: `lib/supabase/client.ts`
- server/user-scoped: `lib/supabase/server.ts`
- service role: `lib/supabase/service-role.ts`

Gated unauthenticated actions such as save/rate/photo upload use:

`ensureAuthForGatedAction()` → `sessionStorage` → signup → `ResumePendingGatedActions`

Preserve this unless explicitly changing the auth flow.

Dev auth is local-only. Never introduce it into production paths.

---

## Data

Read `supabase/schema-dev.sql` and relevant migrations before assuming schema.

There is no generated `database.types.ts`.

Core tables:

- `places`: deactivate with `is_active = false`; never hard-delete
- `place_stats`: trigger-managed; never write directly
- `ratings`: one row per user/place
- `saved`: canonical saves table
- `favorites`: dead code; do not write
- `profiles`
- `user_preferences`
- `place_submissions`

Current enum values:

`place_type`: `cafe`, `library`, `bookstore`, `tea_shop`

`noise_level`: `silent`, `quiet`, `vibrant`

`tables_label`: `limited`, `mixed`, `plentiful`

`outlets_label`: `scarce`, `some`, `ample`

Legacy enum values may still exist. Do not remove fallback handling in `feedItemsFromPlaces.ts` or `saved/route.ts`.

Postgres `bigint` values must use `Number()` before JSON serialization.

---

## Feed

`GET /api/feed` uses the `get_feed_places` RPC.

Raw rows must go through:

`buildFeedItemsFromPlaces()`

Never construct `FeedItem[]` manually.

Current sort:

1. match score DESC
2. distance ASC
3. rating count DESC

Match score:

- 70% preference alignment
- 30% community quality

Cold-start users use community quality only.

Do not change ranking behavior without approval unless fixing a clear bug.

---

## Photos

`places.google_photo_ref` is a reference, not a URL.

Proxy through:

`GET /api/place-photo?ref=...`

User photos live in Supabase Storage `user-photos` and must be served through:

`GET /api/storage/user-photos/...`

Never expose raw storage URLs.

Vibe photo priority:

1. `vibe_photo_path`
2. `vibe_photo_ref`
3. `google_photo_ref`

Photo upload:

1. `POST /api/places/[id]/upload-photo`
2. `PATCH /api/places/[id]/rate`

Maximum 6 photos per rating.

Imagery is important to Elsewhere. Proactively identify weak or missing-photo experiences, but do not add new image providers, scraping, or storage pipelines without approval.

---

## Location

When geolocation is denied or the user is outside NoVA, fallback location is intentionally:

`{ lat: 38.8304, lng: -77.1941 }`

Annandale, VA.

Do not change the fallback without approval.

You should still test whether the UI communicates the fallback clearly.

---

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript 5
- Supabase / Postgres 17
- Supabase Auth
- Tailwind CSS v3
- Mapbox GL
- TanStack Query v5
- Zustand v5
- PostHog
- Vercel

---

## Before Finishing

Verify:

- [ ] Root cause understood
- [ ] Existing patterns searched before creating new code
- [ ] TypeScript/build/tests appropriate to the change pass
- [ ] API responses remain `{ data, error }`
- [ ] Correct Supabase client used
- [ ] Auth checks remain correct
- [ ] No raw `bigint` serialization
- [ ] Elsewhere design tokens and typography preserved
- [ ] `min-[1025px]:` used instead of `lg:`
- [ ] `frontend-plan.md` followed
- [ ] Mobile tested
- [ ] Full affected journey tested in Claude in Chrome
- [ ] Loading/error/empty states considered
- [ ] Adjacent regressions checked
- [ ] Final diff self-reviewed
- [ ] Product backlog updated where relevant
- [ ] No unrelated files changed

## Completion Reports

Keep reports concise:

### Completed

What changed and why.

### Verified

Claude in Chrome flows plus automated checks.

### Discovered

Important bugs, edge cases, or opportunities found.

### Decisions Needed

Only genuine product decisions.

---

## Standing Instruction

Your job is not simply to keep Elsewhere technically functional.

Continuously ask:

> **What is preventing this from being an app people genuinely want to use?**

Find those problems.

Fix the clear ones.

Surface the consequential ones with a recommendation.

Test the actual experience.
