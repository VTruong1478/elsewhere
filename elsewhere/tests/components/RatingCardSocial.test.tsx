import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RatingCard, type RatingCardItem } from '@/components/social/RatingCard'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

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

const ensureAuthForGatedAction = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: (...a: unknown[]) => ensureAuthForGatedAction(...a),
}))

const showToast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast }) }))

vi.mock('@/components/social/RatingCommentsThread', () => ({
  RatingCommentsThread: () => <div data-testid="comments-thread" />,
}))

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
    like_count: 3,
    comment_count: 2,
    viewer_has_liked: false,
    ...overrides,
  }
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

/**
 * Item 8 — Like and Comment were fully styled controls with no onClick at all.
 */
describe('RatingCard like and comment actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureAuthForGatedAction.mockResolvedValue(true)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { like_count: 4, viewer_has_liked: true } }),
    }) as unknown as typeof fetch
  })

  it('renders the current counts', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: wrapper() })
    expect(screen.getByRole('button', { name: /^like$/i })).toHaveTextContent('3')
    expect(
      screen.getByRole('button', { name: /show comments/i }),
    ).toHaveTextContent('2')
  })

  it('likes optimistically and reconciles to the server count', async () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole('button', { name: /^like$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/ratings/rating-1/likes',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /unlike/i })
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      expect(btn).toHaveTextContent('4')
    })
  })

  it('sends DELETE when already liked', async () => {
    render(<RatingCard item={makeItem({ viewer_has_liked: true })} showUserHeader />, {
      wrapper: wrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /unlike/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/ratings/rating-1/likes',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('rolls back and reports when the like fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rating not found' }),
    }) as unknown as typeof fetch

    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: wrapper() })
    fireEvent.click(screen.getByRole('button', { name: /^like$/i }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Rating not found'))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^like$/i })
      expect(btn).toHaveAttribute('aria-pressed', 'false')
      expect(btn).toHaveTextContent('3')
    })
  })

  it('gates liking for logged-out visitors', async () => {
    ensureAuthForGatedAction.mockResolvedValue(false)
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole('button', { name: /^like$/i }))

    await waitFor(() => expect(ensureAuthForGatedAction).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/social/ratings/rating-1/likes',
      expect.anything(),
    )
  })

  it('toggles the comment thread', () => {
    render(<RatingCard item={makeItem()} showUserHeader />, { wrapper: wrapper() })

    expect(screen.queryByTestId('comments-thread')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show comments/i }))
    expect(screen.getByTestId('comments-thread')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /hide comments/i }))
    expect(screen.queryByTestId('comments-thread')).not.toBeInTheDocument()
  })
})
