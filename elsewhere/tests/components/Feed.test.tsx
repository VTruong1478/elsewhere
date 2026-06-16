/**
 * Feed tests
 *
 * PlaceCard is the primary testable unit of the feed (bookmark, click, rendering).
 * FeedPage (the default export) is also exercised for list / empty / skeleton states
 * using mocks for mapbox and other heavy dependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import type { FeedItem } from '@/types/feed'

// ── Static imports (vi.mock() hoisting ensures mocks are in place) ────────────
import { PlaceCard } from '@/components/feed/PlaceCard'
import FeedPage from '@/app/(app)/feed/page'
import { useUserLocation } from '@/hooks/useUserLocation'
import { usePlaceStore } from '@/store/usePlaceStore'

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/feed'),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/analytics', () => ({
  captureFeedLoaded: vi.fn(),
  capturePlaceOpened: vi.fn(),
  capturePlaceSaved: vi.fn(),
  buildRateHref: vi.fn((id: string) => `/places/${id}/rate`),
  feedItemHasPhotos: vi.fn(() => false),
  analyticsSourceFromPathname: vi.fn(() => 'feed'),
  captureFiltersApplied: vi.fn(),
  captureEvent: vi.fn(),
}))

vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/gatedAction', () => ({
  tryCaptureGatedActionCompleted: vi.fn(),
  persistPendingGatedAction: vi.fn(),
  setOAuthAuthIntent: vi.fn(),
}))

vi.mock('@/store/usePlaceStore', () => ({
  usePlaceStore: vi.fn(() => ({
    selectedPlaceId: null,
    setSelectedPlaceId: vi.fn(),
    hoveredPlaceId: null,
    setHoveredPlaceId: vi.fn(),
  })),
}))

vi.mock('@/lib/userPhotoProxyUrl', () => ({
  userPhotoProxyUrl: vi.fn((p: string) => `/api/storage/user-photos/${p}`),
}))

vi.mock('@/components/map/MapPanel', () => ({ MapPanel: () => null }))
vi.mock('@/components/map/FeedMap', () => ({
  FeedMap: () => null,
  DEFAULT_MAP_ZOOM: 12,
}))
vi.mock('@/components/map/MapLoadingOverlay', () => ({
  MapLoadingOverlay: () => null,
}))
vi.mock('@/components/onboarding/TutorialModal', () => ({
  TutorialModal: () => null,
  TUTORIAL_PENDING_KEY: 'elsewhere:tutorial_pending',
}))
vi.mock('@/components/feed/SearchBar', () => ({
  SearchBar: () => <input data-testid="search-bar" aria-label="Search" />,
}))
vi.mock('@/components/feed/AddMissingPlaceModal', () => ({
  AddMissingPlaceModal: () => null,
}))
vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: vi.fn(() => ({ status: 'denied' })),
}))

// ── matchMedia stub (required by PlaceCard's useLayoutEffect) ─────────────────

function stubMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLACE_ID = '00000000-0000-0000-0000-000000000001'

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: PLACE_ID,
    name: 'Test Cafe',
    address: '123 Main St',
    lat: 38.88,
    lng: -77.09,
    place_type: 'cafe',
    noise: 'Quiet',
    tables: 'mixed',
    outlets: 'some',
    match_score_percent: 80,
    why_matched: [],
    open_now: true,
    closes_at: '8:00 PM',
    closing_soon: false,
    open_late: false,
    pills: [],
    is_favorited: false,
    user_has_rated: false,
    rating_count: 5,
    ...overrides,
  }
}

function makeQcWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

// ── PlaceCard unit tests ───────────────────────────────────────────────────────

describe('PlaceCard', () => {
  beforeEach(() => {
    stubMatchMedia(false)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the place name', () => {
    render(<PlaceCard place={makeFeedItem()} />, { wrapper: makeQcWrapper() })
    expect(screen.getByText('Test Cafe')).toBeInTheDocument()
  })

  it('renders the place type pill', () => {
    render(<PlaceCard place={makeFeedItem({ place_type: 'cafe' })} />, {
      wrapper: makeQcWrapper(),
    })
    expect(screen.getByText('Cafe')).toBeInTheDocument()
  })

  it('renders a Rate button', () => {
    render(<PlaceCard place={makeFeedItem()} />, { wrapper: makeQcWrapper() })
    expect(screen.getByRole('button', { name: /^rate$/i })).toBeInTheDocument()
  })

  it('renders a Rated indicator when user has already rated', () => {
    render(<PlaceCard place={makeFeedItem({ user_has_rated: true })} />, {
      wrapper: makeQcWrapper(),
    })
    expect(screen.getByText('Rated')).toBeInTheDocument()
  })

  it('bookmark button has save aria-label when place is not saved', () => {
    render(<PlaceCard place={makeFeedItem({ is_favorited: false })} />, {
      wrapper: makeQcWrapper(),
    })
    const btn = screen.getByRole('button', { name: /save test cafe/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('bookmark button has remove aria-label when place is already saved', () => {
    render(<PlaceCard place={makeFeedItem({ is_favorited: true })} />, {
      wrapper: makeQcWrapper(),
    })
    const btn = screen.getByRole('button', {
      name: /remove test cafe from saved/i,
    })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking bookmark on unsaved place calls POST /api/saved', async () => {
    render(<PlaceCard place={makeFeedItem({ is_favorited: false })} />, {
      wrapper: makeQcWrapper(),
    })
    fireEvent.click(screen.getByRole('button', { name: /save test cafe/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/saved',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('clicking bookmark on saved place calls DELETE /api/saved/[id]', async () => {
    render(<PlaceCard place={makeFeedItem({ is_favorited: true })} />, {
      wrapper: makeQcWrapper(),
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove test cafe from saved/i }),
    )
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/saved/${encodeURIComponent(PLACE_ID)}`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('clicking the card calls setSelectedPlaceId with the place id', () => {
    const mockSetSelectedPlaceId = vi.fn()
    vi.mocked(usePlaceStore).mockReturnValue({
      selectedPlaceId: null,
      setSelectedPlaceId: mockSetSelectedPlaceId,
      hoveredPlaceId: null,
      setHoveredPlaceId: vi.fn(),
    })

    render(<PlaceCard place={makeFeedItem()} />, { wrapper: makeQcWrapper() })
    // Use data-place-id to target the card article precisely — getByRole('button', {name})
    // would also match the bookmark button whose aria-label contains the place name.
    const card = document.querySelector(`[data-place-id="${PLACE_ID}"]`)!
    fireEvent.click(card)
    expect(mockSetSelectedPlaceId).toHaveBeenCalledWith(PLACE_ID)
  })
})

// ── FeedPage integration tests ────────────────────────────────────────────────

describe('FeedPage', () => {
  beforeEach(() => {
    stubMatchMedia(false)
    // Reset useUserLocation to a known default
    vi.mocked(useUserLocation).mockReturnValue({ status: 'denied' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading skeletons while location is still loading', async () => {
    vi.mocked(useUserLocation).mockReturnValue({ status: 'loading' })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <Suspense fallback={null}>
            <FeedPage />
          </Suspense>
        </QueryClientProvider>,
      )
    })

    // PlaceCardSkeleton elements carry aria-hidden="true" on their root article
    const skeletons = document.querySelectorAll('article[aria-hidden]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders place cards when feed returns places', async () => {
    vi.mocked(useUserLocation).mockReturnValue({ status: 'denied' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            makeFeedItem({ id: '00000000-0000-0000-0000-000000000001', name: 'Cafe Alpha' }),
            makeFeedItem({ id: '00000000-0000-0000-0000-000000000002', name: 'Cafe Beta' }),
          ],
        }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <Suspense fallback={null}>
            <FeedPage />
          </Suspense>
        </QueryClientProvider>,
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Cafe Alpha')).toBeInTheDocument()
      expect(screen.getByText('Cafe Beta')).toBeInTheDocument()
    })
  })

  it('renders empty state when feed returns no places', async () => {
    vi.mocked(useUserLocation).mockReturnValue({ status: 'denied' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <Suspense fallback={null}>
            <FeedPage />
          </Suspense>
        </QueryClientProvider>,
      )
    })

    await waitFor(() => {
      expect(screen.getByText('No places found')).toBeInTheDocument()
    })
  })

  it('renders filter chips', async () => {
    vi.mocked(useUserLocation).mockReturnValue({ status: 'loading' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <Suspense fallback={null}>
            <FeedPage />
          </Suspense>
        </QueryClientProvider>,
      )
    })

    // FilterChips renders FEED_FILTER_OPTIONS as clickable buttons
    expect(screen.getByRole('button', { name: 'All spots' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiet' })).toBeInTheDocument()
  })
})
