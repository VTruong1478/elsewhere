import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentErrorState } from '@/components/layout/SegmentErrorState'
import FeedError from '@/app/(app)/feed/error'
import ProfileError from '@/app/(app)/profile/error'
import PlaceDetailError from '@/app/(app)/places/[id]/error'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/profile',
  useRouter: () => ({ push }),
}))

const captureEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  captureEvent: (...args: unknown[]) => captureEvent(...args),
}))

/**
 * The per-segment error.tsx files are thin wrappers whose whole job is to keep
 * a failing tab inside the app shell. Structure (which segments have a
 * boundary at all) is asserted in tests/boundaries.test.ts.
 */
describe('SegmentErrorState', () => {
  beforeEach(() => {
    push.mockClear()
    captureEvent.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows the segment-specific title and recovery actions', () => {
    render(
      <SegmentErrorState
        error={new Error('boom')}
        reset={vi.fn()}
        title="Couldn't load your profile"
      />,
    )

    expect(
      screen.getByRole('heading', { name: "Couldn't load your profile" }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument()
  })

  it('calls reset when Try again is pressed', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    render(
      <SegmentErrorState error={new Error('boom')} reset={reset} title="Nope" />,
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('routes home without a full reload, so the app shell stays mounted', async () => {
    const user = userEvent.setup()
    render(
      <SegmentErrorState error={new Error('boom')} reset={vi.fn()} title="Nope" />,
    )

    await user.click(screen.getByRole('button', { name: 'Go home' }))
    expect(push).toHaveBeenCalledWith('/feed')
  })

  it.each([
    [FeedError, /couldn.t load your feed/i],
    [ProfileError, /couldn.t load your profile/i],
    [PlaceDetailError, /couldn.t load this place/i],
  ])('segment boundary %# renders its own copy', (Boundary, expected) => {
    render(<Boundary error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('heading', { name: expected })).toBeInTheDocument()
  })
})
