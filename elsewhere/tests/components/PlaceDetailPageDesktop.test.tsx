import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const push = vi.fn()
const back = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/places/p1',
}))

const panelProps: Record<string, unknown>[] = []
vi.mock('@/components/feed/DesktopPlaceDetailPanel', () => ({
  DesktopPlaceDetailPanel: (props: Record<string, unknown>) => {
    panelProps.push(props)
    return <div data-testid="desktop-panel" />
  },
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

/**
 * Item 14 — the desktop route now reuses the feed's detail panel instead of the
 * title-and-photo stub, so a shared link opened on desktop reaches full parity.
 */
describe('PlaceDetailPageDesktop', () => {
  it('renders the shared detail panel with the route place and centre', async () => {
    const { PlaceDetailPageDesktop } = await import(
      '@/components/places/PlaceDetailPageDesktop'
    )
    render(
      <PlaceDetailPageDesktop
        placeId="place-1"
        initialCenter={{ lat: 38.83, lng: -77.19 }}
      />,
      { wrapper: wrapper() },
    )

    expect(screen.getByTestId('desktop-panel')).toBeInTheDocument()
    expect(panelProps[0]).toMatchObject({
      placeId: 'place-1',
      initialCenter: { lat: 38.83, lng: -77.19 },
    })
    // Dismissal must be wired, otherwise the page is a dead end.
    expect(typeof panelProps[0].onDismiss).toBe('function')
  })
})
