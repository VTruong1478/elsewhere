/**
 * Map component tests (FeedMap + LocationStatusMessageBody)
 *
 * Mapbox GL requires WebGL / a canvas which jsdom does not support.
 * The mapbox-gl module is replaced with a lightweight mock defined in
 * tests/mocks/mapbox.ts.
 *
 * NOTE: "Location-aware status message" is tested via LocationStatusMessageBody
 * directly, since that component lives in components/feed/ and is rendered by
 * FeedContent — not by FeedMap itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedItem } from '@/types/feed'

// ── mapbox-gl mock ─────────────────────────────────────────────────────────────
// Must be at top level so vi.mock hoisting picks it up before imports.
vi.mock('mapbox-gl', async () => {
  const mod = await import('@/tests/mocks/mapbox')
  return { default: mod.default }
})

// ── Other mocks ───────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/feed'),
}))

vi.mock('@/lib/analytics', () => ({
  capturePlaceOpened: vi.fn(),
}))

vi.mock('@/store/usePlaceStore', () => ({
  usePlaceStore: vi.fn(() => ({
    selectedPlaceId: null,
    hoveredPlaceId: null,
    setSelectedPlaceId: vi.fn(),
    setHoveredPlaceId: vi.fn(),
  })),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLACE_1: FeedItem = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Map Cafe',
  address: '1 Map St',
  lat: 38.88,
  lng: -77.09,
  place_type: 'cafe',
  noise: 'Quiet',
  tables: 'mixed',
  outlets: 'some',
  match_score_percent: 75,
  why_matched: [],
  open_now: true,
  closes_at: null,
  closing_soon: false,
  open_late: false,
  pills: [],
}

const PLACE_2: FeedItem = {
  ...PLACE_1,
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Map Library',
  lat: 38.89,
  lng: -77.10,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

// ── FeedMap tests ─────────────────────────────────────────────────────────────

describe('FeedMap', () => {
  beforeEach(async () => {
    // Provide access token so component renders the map (not the "unavailable" fallback)
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token')
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_STYLE', 'mapbox://styles/mapbox/streets-v12')

    // Reset tracked marker instances between tests
    const { resetMapboxMocks } = await import('@/tests/mocks/mapbox')
    resetMapboxMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders the map container div', async () => {
    const { FeedMap } = await import('@/components/map/FeedMap')
    await act(async () => {
      render(
        <FeedMap
          places={[]}
          selectedPlaceId={null}
          onSelectPlace={vi.fn()}
        />,
        { wrapper: makeWrapper() },
      )
    })
    // The outer wrapper and the inner mapContainerRef div are both present
    const container = document.querySelector('.h-full.w-full')
    expect(container).toBeInTheDocument()
  })

  it('renders "Map unavailable" message when access token is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '')

    const { FeedMap } = await import('@/components/map/FeedMap')
    render(
      <FeedMap
        places={[]}
        selectedPlaceId={null}
        onSelectPlace={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText(/map unavailable/i)).toBeInTheDocument()
  })

  it('creates a Marker for each valid place', async () => {
    const { FeedMap } = await import('@/components/map/FeedMap')
    const { createdMarkers } = await import('@/tests/mocks/mapbox')

    await act(async () => {
      render(
        <FeedMap
          places={[PLACE_1, PLACE_2]}
          selectedPlaceId={null}
          onSelectPlace={vi.fn()}
          center={{ lat: 38.88, lng: -77.09 }}
        />,
        { wrapper: makeWrapper() },
      )
    })

    // One marker per valid place
    expect(createdMarkers.length).toBe(2)
  })

  it('calls onSelectPlace with the place id when a marker is clicked (pointerup)', async () => {
    const onSelectPlace = vi.fn()
    const { FeedMap } = await import('@/components/map/FeedMap')
    const { createdMarkers } = await import('@/tests/mocks/mapbox')

    await act(async () => {
      render(
        <FeedMap
          places={[PLACE_1]}
          selectedPlaceId={null}
          onSelectPlace={onSelectPlace}
          center={{ lat: 38.88, lng: -77.09 }}
        />,
        { wrapper: makeWrapper() },
      )
    })

    expect(createdMarkers.length).toBeGreaterThan(0)

    // Dispatch a mouse pointerup on the first marker element.
    // FeedMap's handler fires onSelectPlace when:
    //   - pointerType = 'mouse', button = 0
    //   - movement distance ≤ threshold
    const markerEl = createdMarkers[0].element
    await act(async () => {
      fireEvent(
        markerEl,
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerType: 'mouse',
          button: 0,
          clientX: 0,
          clientY: 0,
        }),
      )
    })

    await waitFor(() => {
      expect(onSelectPlace).toHaveBeenCalledWith(PLACE_1.id)
    })
  })
})

// ── LocationStatusMessageBody tests ──────────────────────────────────────────

describe('LocationStatusMessageBody', () => {
  it('renders a plain text message', async () => {
    const { LocationStatusMessageBody } = await import(
      '@/components/feed/LocationStatusMessageBody'
    )
    render(
      <LocationStatusMessageBody
        message={{ kind: 'plain', text: 'Showing all places in NoVA.' }}
      />,
    )
    expect(screen.getByText('Showing all places in NoVA.')).toBeInTheDocument()
  })

  it('renders an "Enable location" button for the request-location kind (permission pending/denied)', async () => {
    const { LocationStatusMessageBody } = await import(
      '@/components/feed/LocationStatusMessageBody'
    )
    render(
      <LocationStatusMessageBody message={{ kind: 'request-location' }} />,
    )
    expect(screen.getByRole('button', { name: /enable location/i })).toBeInTheDocument()
  })

  it('renders a waitlist link for the waitlist kind (user outside NoVA)', async () => {
    const { LocationStatusMessageBody } = await import(
      '@/components/feed/LocationStatusMessageBody'
    )
    render(<LocationStatusMessageBody message={{ kind: 'waitlist' }} />)
    expect(
      screen.getByRole('link', { name: /add your area to the waitlist/i }),
    ).toBeInTheDocument()
  })
})
