import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/places/p1/rate',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/analytics', () => ({
  captureRatingFunnelEvent: vi.fn(),
  captureEvent: vi.fn(),
  parseAnalyticsSource: () => 'feed',
}))

vi.mock('@/lib/gatedAction', () => ({
  tryCaptureGatedActionCompleted: vi.fn(),
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

const PLACE_ID = '11111111-1111-4111-8111-111111111111'

/**
 * Item 13 — the rating POST used to run BEFORE photo upload, so a failed upload
 * reported failure for a rating that had already been saved. Photos now upload
 * first and the rating is written once, with paths attached.
 */
describe('RatingForm submit ordering', () => {
  beforeEach(() => vi.clearAllMocks())

  async function renderAndFillRequiredFields() {
    const { RatingForm } = await import('@/components/rating/RatingForm')
    render(
      <RatingForm placeId={PLACE_ID} placeName="Test Cafe" source="feed" />,
      { wrapper: makeWrapper() },
    )

    const user = userEvent.setup()
    const slider = screen.getByRole('slider', { name: /overall rating/i })
    slider.focus()
    await user.keyboard('{End}')

    // One option from each required group, by its visible option label.
    for (const option of ['silent', 'focused', 'limited', 'scarce']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${option}$`, 'i') })
      await user.click(btn)
    }
    return user
  }

  it('does not write the rating when a photo upload fails', async () => {
    const calls: string[] = []
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push(`${method} ${url}`)

      if (url.includes('/upload-photo')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Upload exploded' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: null }) })
    }) as unknown as typeof fetch

    const user = await renderAndFillRequiredFields()

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    expect(fileInput).toBeTruthy()
    await user.upload(
      fileInput,
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    )

    const submit = screen.getByRole('button', { name: /submit|post/i })
    await user.click(submit)

    await waitFor(() => {
      expect(calls.some((c) => c.includes('/upload-photo'))).toBe(true)
    })

    // The rating POST must never have run.
    const ratePosts = calls.filter(
      (c) => c.startsWith('POST') && /\/rate$/.test(c),
    )
    expect(ratePosts).toHaveLength(0)
  })

  it('uploads photos before writing the rating, and does not PATCH', async () => {
    const calls: string[] = []
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push(`${method} ${url}`)

      if (url.includes('/upload-photo')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: 'user-photos/p/u-1.jpg' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: null }) })
    }) as unknown as typeof fetch

    const user = await renderAndFillRequiredFields()

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    await user.upload(
      fileInput,
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    )

    await user.click(screen.getByRole('button', { name: /submit|post/i }))

    await waitFor(() => {
      expect(calls.some((c) => c.startsWith('POST') && /\/rate$/.test(c))).toBe(
        true,
      )
    })

    const uploadIdx = calls.findIndex((c) => c.includes('/upload-photo'))
    const rateIdx = calls.findIndex(
      (c) => c.startsWith('POST') && /\/rate$/.test(c),
    )
    expect(uploadIdx).toBeGreaterThanOrEqual(0)
    expect(uploadIdx).toBeLessThan(rateIdx)

    // The PATCH is no longer part of the happy path.
    expect(calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(0)
  })
})
