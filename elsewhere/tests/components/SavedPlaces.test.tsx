/**
 * Saved places page tests
 *
 * SavedPage (app/(app)/saved/page.tsx) is the component under test.
 * PlaceCard is the card component; bookmark behaviour is exercised through it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedItem } from '@/types/feed'

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/saved'),
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
  capturePlaceOpened: vi.fn(),
  capturePlaceSaved: vi.fn(),
  buildRateHref: vi.fn(
    (id: string) => `/places/${id}/rate`,
  ),
  feedItemHasPhotos: vi.fn(() => false),
  analyticsSourceFromPathname: vi.fn(() => 'saved'),
  captureEvent: vi.fn(),
}))

vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/gatedAction', () => ({
  tryCaptureGatedActionCompleted: vi.fn(),
  persistPendingGatedAction: vi.fn(),
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

// ── matchMedia stub ────────────────────────────────────────────────────────────

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

const PLACE_ID_1 = '00000000-0000-0000-0000-000000000001'
const PLACE_ID_2 = '00000000-0000-0000-0000-000000000002'

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: PLACE_ID_1,
    name: 'Saved Spot',
    address: '1 Library Lane',
    lat: 38.88,
    lng: -77.09,
    place_type: 'library',
    noise: 'Silent',
    tables: 'plentiful',
    outlets: 'ample',
    match_score_percent: 90,
    why_matched: [],
    open_now: true,
    closes_at: null,
    closing_soon: false,
    open_late: false,
    pills: [],
    is_favorited: true,
    user_has_rated: false,
    rating_count: 3,
    ...overrides,
  }
}

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

async function renderSavedPage(qc: QueryClient) {
  const SavedPage = (await import('@/app/(app)/saved/page')).default
  render(<SavedPage />, { wrapper: makeWrapper(qc) })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SavedPage', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a list of saved places', async () => {
    const saved = [
      makeFeedItem({ id: PLACE_ID_1, name: 'Library One' }),
      makeFeedItem({ id: PLACE_ID_2, name: 'Library Two' }),
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: saved }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => { await renderSavedPage(qc) })

    await waitFor(() => {
      expect(screen.getByText('Library One')).toBeInTheDocument()
      expect(screen.getByText('Library Two')).toBeInTheDocument()
    })
  })

  it('each saved place card renders the place name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: [makeFeedItem({ name: 'My Favourite Spot' })] }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => { await renderSavedPage(qc) })

    await waitFor(() => {
      expect(screen.getByText('My Favourite Spot')).toBeInTheDocument()
    })
  })

  it('renders empty state when no places are saved', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => { await renderSavedPage(qc) })

    await waitFor(() => {
      expect(screen.getByText('No saved spots yet')).toBeInTheDocument()
    })
  })

  it('renders loading skeletons while the query is pending', async () => {
    // Fetch that never resolves → query stays in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => { await renderSavedPage(qc) })

    const skeletons = document.querySelectorAll('article[aria-hidden]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('unsave button (bookmark) calls DELETE /api/saved/[id]', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: [makeFeedItem({ id: PLACE_ID_1, is_favorited: true })] }),
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => { await renderSavedPage(qc) })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /remove saved spot from saved/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /remove saved spot from saved/i }),
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/saved/${encodeURIComponent(PLACE_ID_1)}`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
