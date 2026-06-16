/**
 * Tests for ProfileContent rendered in "public profile" context
 * (isOwnProfile=false, email=null — the shape the [userId]/page.tsx passes in).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileContent } from '@/components/profile/ProfileContent'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/components/social/RatingCard', () => ({
  RatingCard: () => <div data-testid="rating-card" />,
}))

vi.mock('@/components/feed/PlaceCard', () => ({
  PlaceCard: () => <div data-testid="place-card" />,
}))

vi.mock('@/components/feed/PlaceCardSkeleton', () => ({
  PlaceCardSkeleton: () => <div data-testid="place-card-skeleton" />,
}))

vi.mock('@/components/profile/UserListSheet', () => ({
  UserListSheet: () => null,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_STATS = {
  placesRated: 14,
  photosUploaded: 3,
  placesSaved: 8,
  followersCount: 42,
  followingCount: 17,
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Public profile page (ProfileContent)', () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>)
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'viewer-id' } } },
        }),
      },
    } as ReturnType<typeof createClient>)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  })

  it('renders the viewed user name', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByRole('heading', { name: 'Jamie Garcia' })).toBeInTheDocument()
  })

  it('does not render email field when email is null', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    // Public-profile pages always pass email=null; no @ should appear
    expect(screen.queryByText(/@/)).toBeNull()
  })

  it('renders followers count', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Followers')).toBeInTheDocument()
  })

  it('renders following count', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
  })

  it('ratings tab is active by default', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    // Active tab receives text-primary; inactive tab receives text-text-secondary
    expect(screen.getByRole('button', { name: 'Ratings' })).toHaveClass('text-primary')
    expect(screen.getByRole('button', { name: 'Saved' })).not.toHaveClass('text-primary')
  })

  it('clicking Saved tab switches the active tab', () => {
    render(
      <ProfileContent
        userId="some-user"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
      />,
      { wrapper: makeWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveClass('text-primary')
    expect(screen.getByRole('button', { name: 'Ratings' })).not.toHaveClass('text-primary')
  })

  it('follow button is hidden when viewing own profile', () => {
    render(
      <ProfileContent
        userId="my-id"
        fullName="Me"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={true}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unfollow' })).not.toBeInTheDocument()
  })

  it('follow button is visible when viewing another user profile', () => {
    render(
      <ProfileContent
        userId="other-id"
        fullName="Jamie Garcia"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
        initialIsFollowing={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })
})
