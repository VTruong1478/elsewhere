import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RatingCard, type RatingCardItem } from '@/components/social/RatingCard'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/components/ui/MatchRing', () => ({
  MatchRing: ({ score }: { score: number }) => (
    <div data-testid="match-ring">{score}</div>
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<RatingCardItem> = {}): RatingCardItem {
  return {
    id: 'rating-1',
    notes: null,
    photo_paths: [],
    created_at: new Date(Date.now() - 60_000).toISOString(),
    place_id: 'place-1',
    place_name: 'Fairfax Coffee',
    match_score_percent: 85,
    is_saved: false,
    rater_id: 'user-1',
    rater_name: 'Alice',
    rater_username: null,
    rater_avatar: null,
    ...overrides,
  }
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

describe('RatingCard — social feed view (showUserHeader = true)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
  })

  it('renders user avatar link', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: makeWrapper() })
    // Avatar Link has aria-label "View Alice's profile"
    expect(screen.getByRole('link', { name: /alice.*profile/i })).toBeInTheDocument()
  })

  it('renders rater name', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: makeWrapper() })
    expect(screen.getByRole('link', { name: 'Alice' })).toBeInTheDocument()
  })

  it('rater name links to /profile/[userId]', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: makeWrapper() })
    const nameLink = screen.getByRole('link', { name: 'Alice' })
    expect(nameLink).toHaveAttribute('href', '/profile/user-1')
  })

  it('renders place name', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: makeWrapper() })
    expect(screen.getByText('Fairfax Coffee')).toBeInTheDocument()
  })

  it('renders match score ring when match_score_percent is set', () => {
    render(
      <RatingCard item={makeItem({ match_score_percent: 85 })} showUserHeader />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByTestId('match-ring')).toBeInTheDocument()
  })

  it('renders photo strip when photo_paths is non-empty', () => {
    const { container } = render(
      <RatingCard
        item={makeItem({ photo_paths: ['img/a.jpg', 'img/b.jpg'] })}
        showUserHeader
      />,
      { wrapper: makeWrapper() },
    )
    // Photo strip images use alt="" (decorative) → ARIA role "presentation",
    // not "img". Query the DOM directly.
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })

  it('does not render photo strip when photo_paths is empty', () => {
    const { container } = render(
      <RatingCard item={makeItem({ photo_paths: [] })} showUserHeader />,
      { wrapper: makeWrapper() },
    )
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('renders notes when non-empty', () => {
    render(
      <RatingCard item={makeItem({ notes: 'Great work spot!' })} showUserHeader />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText('Great work spot!')).toBeInTheDocument()
  })

  it('does not render notes when notes is null', () => {
    render(<RatingCard item={makeItem({ notes: null })} showUserHeader />, {
      wrapper: makeWrapper(),
    })
    expect(screen.queryByText('Great work spot!')).not.toBeInTheDocument()
  })

  it('bookmark button calls POST /api/saved when place is not saved', async () => {
    render(<RatingCard item={makeItem({ is_saved: false })} showUserHeader />, {
      wrapper: makeWrapper(),
    })
    fireEvent.click(screen.getByRole('button', { name: /save fairfax coffee/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/saved',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('bookmark button calls DELETE /api/saved/[id] when place is already saved', async () => {
    render(<RatingCard item={makeItem({ is_saved: true })} showUserHeader />, {
      wrapper: makeWrapper(),
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove fairfax coffee from saved/i }),
    )
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/saved/${encodeURIComponent('place-1')}`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})

describe('RatingCard — profile view (showUserHeader = false)', () => {
  it('place name links to the correct place detail route', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <RatingCard item={makeItem()} showUserHeader={false} />
      </QueryClientProvider>,
    )
    // showUserHeader=false renders a native <a href="/places/[id]">
    const link = screen.getByRole('link', { name: 'Fairfax Coffee' })
    expect(link).toHaveAttribute('href', '/places/place-1')
  })
})
