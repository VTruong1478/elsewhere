# Auth routing audit (Elsewhere)

Concise reference for **logged-out / guest / return-to-intent** behavior and where logic lives. Updated alongside the auth consistency pass.

## Product rules (target)

- Guests may browse **feed**, **map**, and **place detail** (`/places/[id]`).
- **Locked** until signed in: **rate**, **save**, **saved** (`/saved`), **profile** (`/profile`), plus other protected routes (e.g. `/places/new`, `/admin/*`).
- Hitting a locked URL or action should send the user through **one auth entry** (`/login?next=…`) and preserve the intended destination in `next` (and `sessionStorage` for save/rate analytics — see `lib/gatedAction.ts`).
- After successful auth, the user should land on that destination; **save** should complete automatically when possible (see `ResumePendingGatedActions`).
- **Email confirmation** is **not** encoded in this repo: it is configured in the Supabase project (Authentication → Providers → Email). If “Confirm email” is on, `signUp` may return no session until the user verifies; the signup UI surfaces an error instead of sending them to `/feed` without a session.

## Matrix: route / action → behavior (post-fix)

| Entry | Logged out | Notes |
|-------|------------|--------|
| `/` | Client: `justLoggedOut` → `/login`; else `hasVisited` → **`/feed`** else **`/signup`** | `app/page.tsx` → `components/auth/AuthEntryRedirect.tsx` |
| `/auth` | Same as **`/`** (shared **`AuthEntryRedirect`**) | `app/auth/page.tsx` |
| `/signup` | Page loads; if session exists → **redirect to `destinationAfterAuth(next)`** | `app/signup/page.tsx`, `lib/authReturnPath.ts` |
| `/login` | Same session redirect as signup | `app/login/page.tsx` |
| `/feed`, `/map`, `/places/[id]` | **Allowed** | `middleware.ts` `isPublicPath` |
| `/places/[id]/rate` | **Blocked** → **`/login?next=/places/.../rate`** | `middleware.ts` |
| `/saved`, `/profile`, `/places/new`, … | **Blocked** → **`/login?next=…`** | `middleware.ts` |
| In-app **Rate** / **Save** (guest) | **`ensureAuthForGatedAction`** → **`/login?next=returnPath`** | `lib/authGate.ts` |

## Where logic lives

| Concern | File(s) |
|--------|---------|
| Public vs protected paths | `middleware.ts` (session refresh runs on **all** matched routes so cookies stay synced after client auth) |
| Safe `next` open-redirect guard | `lib/safeNextPath.ts` |
| Post-auth URL (`from_auth` on rate URLs) | `lib/authReturnPath.ts` → `destinationAfterAuth` |
| Gate save/rate without session | `lib/authGate.ts`, `lib/gatedAction.ts` |
| Resume pending save after login | `components/auth/ResumePendingGatedActions.tsx` (inside `QueryClientProvider`) |
| Email/password + OAuth return | `app/login/page.tsx`, `app/signup/page.tsx`, `app/auth/callback/route.ts` |
| Profile server guard (no session) | `app/(app)/profile/page.tsx` → `redirect("/login?next=/profile")` (middleware usually sends to login first) |
| Tutorial queue | `components/onboarding/TutorialModal.tsx`; queued only when signup `next` is default feed browse — `shouldQueuePostSignupTutorial` in `app/signup/page.tsx` |

## Known edge cases

- **Expired session**: Middleware sees no user → `/login?next=current path`. Same as direct paste of protected URL.
- **Stale `hasVisited` / `justLoggedOut`**: `/` and `/auth` branch on these via **`AuthEntryRedirect`**; logout sets `justLoggedOut` in `LogoutButton` before `signOut`. **Browse without an account** sets `hasVisited` so the next root visit lands on **`/feed`**.
- **History**: Login/signup success uses **`window.location.assign`** / **`replace`** so Supabase cookies are visible to the next request; avoids client-only navigation races with middleware.
- **OAuth signup + tutorial**: Tutorial is not queued when `next` points away from default `/feed` browse, so return-to-intent (e.g. rate) is not blocked by the first-run tutorial.

## Inconsistencies removed in this pass

- Middleware used to send **`/rate`** URLs to **`/signup`** while client gates used **`/login`** — now **all** use **`/login?next=…`**.
- **`/`** used to **`redirect("/feed")` server-side** — now **client** routing: first visit **`/signup`**, returning **`/feed`** (same as **`/auth`**).
- **Save** after auth did not run automatically — **resume** POSTs pending save when session appears.
- **Signup** always queued the first-run tutorial — now **deferred** when completing a non–feed-browse `next`.
