import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RatingCard, type RatingCardItem } from '@/components/social/RatingCard'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

const ensureAuthForGatedAction = vi.fn()
vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: (...args: unknown[]) =>
    ensureAuthForGatedAction(...args),
}))

const showToast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast }),
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
 * Item 11 — RatingCard's save had no auth gate (unlike PlaceDetailMobile), so a
 * logged-out visitor on a public profile got a silent 401 rollback. It also
 * never told the user when a save failed.
 */
describe('RatingCard save action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as typeof fetch
  })

  function clickBookmark() {
    render(<RatingCard item={makeItem()} />, { wrapper: wrapper() })
    const bookmark = screen.getByRole('button', { name: /save|bookmark/i })
    fireEvent.click(bookmark)
  }

  it('checks auth before saving', async () => {
    ensureAuthForGatedAction.mockResolvedValue(false)
    clickBookmark()

    await waitFor(() =>
      expect(ensureAuthForGatedAction).toHaveBeenCalledTimes(1),
    )
    const ctx = ensureAuthForGatedAction.mock.calls[0][1] as {
      action_type: string
      place_id: string
    }
    expect(ctx.action_type).toBe('save_place')
    expect(ctx.place_id).toBe('place-1')
  })

  it('does not call the save API when the gate refuses', async () => {
    ensureAuthForGatedAction.mockResolvedValue(false)
    clickBookmark()

    await waitFor(() => expect(ensureAuthForGatedAction).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/saved',
      expect.anything(),
    )
  })

  it('reports a failed save to the user', async () => {
    ensureAuthForGatedAction.mockResolvedValue(true)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Save failed upstream' }),
    }) as unknown as typeof fetch

    clickBookmark()

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Save failed upstream'),
    )
  })
})
