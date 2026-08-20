import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RatingCommentsThread } from '@/components/social/RatingCommentsThread'
import { MAX_COMMENT_LENGTH } from '@/lib/constants/comments'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => <a href={href} {...props}>{children}</a>,
}))

const ensureAuthForGatedAction = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: (...a: unknown[]) => ensureAuthForGatedAction(...a),
}))

const showToast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast }) }))

const COMMENT = {
  id: 'c1',
  rating_id: 'rating-1',
  body: 'Great spot for deep work',
  created_at: new Date(Date.now() - 120_000).toISOString(),
  author_id: 'user-2',
  author_name: 'Bob',
  author_username: 'bob',
  author_avatar: null,
  can_delete: true,
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function renderThread() {
  render(
    <RatingCommentsThread
      ratingId="rating-1"
      placeId="place-1"
      placeName="Fairfax Coffee"
    />,
    { wrapper: wrapper() },
  )
}

describe('RatingCommentsThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureAuthForGatedAction.mockResolvedValue(true)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [COMMENT] }),
    }) as unknown as typeof fetch
  })

  it('lists existing comments', async () => {
    renderThread()
    expect(await screen.findByText('Great spot for deep work')).toBeInTheDocument()
    expect(screen.getByText('@bob')).toBeInTheDocument()
  })

  it('shows an empty state when there are none', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch

    renderThread()
    expect(await screen.findByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('caps the composer at the shared max length', async () => {
    renderThread()
    const box = await screen.findByLabelText(/add a comment/i)
    expect(box).toHaveAttribute('maxlength', String(MAX_COMMENT_LENGTH))
  })

  it('posts a comment', async () => {
    renderThread()
    await screen.findByText('Great spot for deep work')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/add a comment/i), 'Nice')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/ratings/rating-1/comments',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('gates posting for logged-out visitors', async () => {
    ensureAuthForGatedAction.mockResolvedValue(false)
    renderThread()
    await screen.findByText('Great spot for deep work')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/add a comment/i), 'Nice')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    await waitFor(() => expect(ensureAuthForGatedAction).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/social/ratings/rating-1/comments',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('deletes a comment the viewer owns', async () => {
    renderThread()
    await screen.findByText('Great spot for deep work')

    fireEvent.click(screen.getByRole('button', { name: /delete comment/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/social/ratings/rating-1/comments/c1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('hides the delete affordance when not permitted', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ ...COMMENT, can_delete: false }] }),
    }) as unknown as typeof fetch

    renderThread()
    await screen.findByText('Great spot for deep work')
    expect(
      screen.queryByRole('button', { name: /delete comment/i }),
    ).not.toBeInTheDocument()
  })

  it('surfaces a load failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope' }),
    }) as unknown as typeof fetch

    renderThread()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn.t load comments/i,
    )
  })
})
