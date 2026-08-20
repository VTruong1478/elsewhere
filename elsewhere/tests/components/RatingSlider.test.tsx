import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/places/p1/rate',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/analytics', () => ({
  captureRatingFunnelEvent: vi.fn(),
  captureEvent: vi.fn(),
  parseAnalyticsSource: () => 'feed',
}))

vi.mock('@/lib/placeDetailQuery', () => ({
  fetchPlaceDetail: vi.fn().mockResolvedValue(null),
  placeDetailQueryKey: (id: string) => ['place-detail', id],
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

/**
 * Item 9 — the overall-rating slider was pointer-only, so a required field
 * could not be completed with a keyboard.
 */
describe('RatingForm overall-rating slider', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    }) as unknown as typeof fetch
  })

  async function renderForm() {
    const { RatingForm } = await import('@/components/rating/RatingForm')
    render(
      <RatingForm placeId="11111111-1111-4111-8111-111111111111" placeName="Test Cafe" source="feed" />,
      { wrapper: makeWrapper() },
    )
    return screen.getByRole('slider', { name: /overall rating/i })
  }

  it('is focusable', async () => {
    const slider = await renderForm()
    expect(slider).toHaveAttribute('tabindex', '0')
  })

  it('increments by half a star on ArrowRight', async () => {
    const user = userEvent.setup()
    const slider = await renderForm()
    slider.focus()

    await user.keyboard('{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '0.5')

    await user.keyboard('{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '1')
  })

  it('supports Home and End, clamped to the declared range', async () => {
    const user = userEvent.setup()
    const slider = await renderForm()
    slider.focus()

    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuenow', '5')

    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuenow', '5')

    await user.keyboard('{Home}')
    expect(slider).toHaveAttribute('aria-valuenow', '0.5')

    await user.keyboard('{ArrowLeft}')
    expect(slider).toHaveAttribute('aria-valuenow', '0.5')
  })
})
