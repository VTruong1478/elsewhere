/**
 * Tests for the follow / unfollow behaviour inside ProfileContent.
 *
 * There is no standalone <FollowButton> component — the follow button lives
 * inside ProfileContent. All tests in this file target that component.
 *
 * Note: ProfileContent does not call ensureAuthForGatedAction for follow. When
 * the viewer is unauthenticated it calls router.push('/signup?next=...') directly
 * after checking supabase.auth.getSession(). The test labelled "redirects to
 * signup" covers that branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// Mock heavy sub-components to keep tests focused on ProfileContent logic.
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
  placesRated: 5,
  photosUploaded: 2,
  placesSaved: 3,
  followersCount: 10,
  followingCount: 7,
}

let mockPush: ReturnType<typeof vi.fn>

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function mockAuthedSession() {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'viewer-id' } } },
      }),
    },
  } as ReturnType<typeof createClient>)
}

function mockUnauthSession() {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  } as ReturnType<typeof createClient>)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Follow button (inside ProfileContent)', () => {
  beforeEach(() => {
    mockPush = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>)
    mockAuthedSession()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  })

  it('renders "Follow" when not following', () => {
    render(
      <ProfileContent
        userId="other-user"
        fullName="Bob"
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

  it('renders "Unfollow" when already following', () => {
    render(
      <ProfileContent
        userId="other-user"
        fullName="Bob"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
        initialIsFollowing={true}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByRole('button', { name: 'Unfollow' })).toBeInTheDocument()
  })

  it('calls POST /api/social/follow/[userId] when authenticated user clicks Follow', async () => {
    render(
      <ProfileContent
        userId="other-user"
        fullName="Bob"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
        initialIsFollowing={false}
      />,
      { wrapper: makeWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/follow/other-user',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('calls DELETE /api/social/follow/[userId] when authenticated user clicks Unfollow', async () => {
    render(
      <ProfileContent
        userId="other-user"
        fullName="Bob"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
        initialIsFollowing={true}
      />,
      { wrapper: makeWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/follow/other-user',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('does not render follow/unfollow button when viewing own profile', () => {
    render(
      <ProfileContent
        userId="my-user-id"
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

  it('redirects to /signup when unauthenticated user clicks Follow', async () => {
    mockUnauthSession()
    render(
      <ProfileContent
        userId="other-user"
        fullName="Bob"
        email={null}
        avatarUrl={null}
        stats={BASE_STATS}
        isOwnProfile={false}
        initialIsFollowing={false}
      />,
      { wrapper: makeWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/signup'),
      )
    })
  })
})
