import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { FeedEmptyState } from '@/components/feed/FeedEmptyState'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
  usePathname: vi.fn(),
}))

vi.mock('@/components/feed/AddMissingPlaceModal', () => ({
  AddMissingPlaceModal: () => null,
}))

function setup(search: string, pathname = '/feed') {
  vi.mocked(useRouter).mockReturnValue({
    push,
  } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as unknown as ReturnType<typeof useSearchParams>,
  )
  vi.mocked(usePathname).mockReturnValue(pathname)
}

beforeEach(() => {
  push.mockReset()
})

describe('FeedEmptyState', () => {
  it('blames the hour, not the catalog, when only "Open now" is narrowing', () => {
    setup('filter=open_now')
    render(<FeedEmptyState variant="plain" />)

    expect(screen.getByText(/Nothing.s open right now/i)).toBeInTheDocument()
    // Submitting a place is the wrong prompt here — the places already exist.
    expect(screen.queryByText(/Add a missing place/i)).not.toBeInTheDocument()
  })

  it('clears only the filter, preserving other params', async () => {
    setup('filter=open_now&q=&radius=15')
    render(<FeedEmptyState variant="plain" />)

    await userEvent.click(screen.getByRole('button', { name: /See all spots/i }))

    expect(push).toHaveBeenCalledTimes(1)
    const target = push.mock.calls[0][0] as string
    expect(target.startsWith('/feed')).toBe(true)
    expect(target).not.toContain('filter=open_now')
    expect(target).toContain('radius=15')
  })

  it('returns to /map when that is where the user is', async () => {
    setup('filter=open_now', '/map')
    render(<FeedEmptyState />)

    await userEvent.click(screen.getByRole('button', { name: /See all spots/i }))
    expect((push.mock.calls[0][0] as string).startsWith('/map')).toBe(true)
  })

  it('keeps the generic copy for a genuine no-results search', () => {
    setup('')
    render(<FeedEmptyState variant="plain" submittedFromSearch="zzzqqq" />)

    expect(screen.getByText(/No places found/i)).toBeInTheDocument()
    expect(screen.getByText(/Add a missing place/i)).toBeInTheDocument()
  })

  it('keeps the generic copy when a search is also narrowing the results', () => {
    // The filter is not the sole cause, so "nothing is open" would be a guess.
    setup('filter=open_now')
    render(<FeedEmptyState variant="plain" submittedFromSearch="quiet cafe" />)

    expect(screen.getByText(/No places found/i)).toBeInTheDocument()
  })
})
