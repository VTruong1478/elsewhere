/**
 * Tests for username → profile route links across social components.
 *
 * Component roles (do not confuse):
 *   PlaceCard          – feed / saved screens. No rater name. No profile link.
 *   SocialRatingCard   – RatingCard with showUserHeader=true. Always links rater
 *                        name to /profile/[userId]; no suppression for any user.
 *   RatingCard         – profile page (showUserHeader=false). Place name only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RatingCard, type RatingCardItem } from '@/components/social/RatingCard'
import { PlaceCard } from '@/components/feed/PlaceCard'
import type { FeedItem } from '@/types/feed'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/feed'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/components/ui/MatchRing', () => ({
  MatchRing: ({ score }: { score: number }) => <div>{score}</div>,
}))

// PlaceCard dependency mocks
vi.mock('@/lib/analytics', () => ({
  buildRateHref: vi.fn(() => '/places/test-id/rate'),
  capturePlaceOpened: vi.fn(),
  capturePlaceSaved: vi.fn(),
  captureEvent: vi.fn(),
  feedItemHasPhotos: vi.fn(() => false),
}))

vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/gatedAction', () => ({
  tryCaptureGatedActionCompleted: vi.fn(),
}))

vi.mock('@/store/usePlaceStore', () => ({
  usePlaceStore: vi.fn(() => ({ setSelectedPlaceId: vi.fn() })),
}))

vi.mock('@/components/ui/MetricTile', () => ({
  MetricTile: () => <div />,
}))

vi.mock('@/components/ui/Pill', () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/ui/StatusDot', () => ({
  StatusDot: () => <div />,
}))

vi.mock('@/lib/placeTypeDisplay', () => ({
  formatPlaceTypeForDisplay: vi.fn((t: string) => t),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const RATING_ITEM: RatingCardItem = {
  id: 'r1',
  notes: null,
  photo_paths: [],
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  place_id: 'place-abc',
  place_name: 'Foundation Coffee',
  match_score_percent: 90,
  is_saved: false,
  rater_id: 'user-xyz',
  rater_name: 'Jordan',
  rater_avatar: null,
}

const PLACE_ITEM: FeedItem = {
  id: 'place-abc',
  name: 'Foundation Coffee',
  address: '123 Main St',
  lat: 38.83,
  lng: -77.19,
  place_type: 'cafe',
  noise: null,
  tables: null,
  outlets: null,
  match_score_percent: null,
  why_matched: [],
  open_now: true,
  closes_at: null,
  closing_soon: false,
  open_late: false,
  pills: [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Username links', () => {
  beforeEach(() => {
    // PlaceCard uses window.matchMedia inside useLayoutEffect
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
  })

  it('PlaceCard does not render any username or profile link', () => {
    render(<PlaceCard place={PLACE_ITEM} />, { wrapper })
    // PlaceCard shows place metadata only — no rater name, no /profile/ href
    expect(document.querySelector('a[href^="/profile/"]')).toBeNull()
  })

  it('rater name on social feed card links to /profile/[userId]', () => {
    render(<RatingCard item={RATING_ITEM} showUserHeader />, { wrapper })
    const nameLink = screen.getByRole('link', { name: 'Jordan' })
    expect(nameLink).toHaveAttribute('href', '/profile/user-xyz')
  })

  it('SocialRatingCard always wraps rater name in a link — no suppression for any user id', () => {
    // RatingCard (showUserHeader=true) has no concept of "current user".
    // The rater name is unconditionally rendered as a <Link> to /profile/[userId].
    // A user won't follow themselves, so suppression is unnecessary by design.
    const item: RatingCardItem = { ...RATING_ITEM, rater_id: 'any-user-id', rater_name: 'Alex' }
    render(<RatingCard item={item} showUserHeader />, { wrapper })
    const link = screen.getByRole('link', { name: 'Alex' })
    expect(link).toHaveAttribute('href', '/profile/any-user-id')
  })
})
