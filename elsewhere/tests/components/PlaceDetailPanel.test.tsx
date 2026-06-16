/**
 * Place detail panel tests (DesktopPlaceDetailPanel)
 *
 * The panel uses TanStack Query internally (fetchPlaceDetail + place-user-photos).
 * Both are driven by global fetch, which is stubbed per test.
 *
 * SKIPPED: "Panel renders at correct initial snap point" — DesktopPlaceDetailPanel
 * is a full-height static desktop panel; it has no bottom-sheet snap points.
 * The mobile bottom-sheet lives in PlaceDetailMobile, a separate component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedItem } from '@/types/feed'
import type { PlaceDetailResponse } from '@/types/placeDetail'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
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
  analyticsSourceFromPathname: vi.fn(() => 'feed'),
  buildRateHref: vi.fn((id: string) => `/places/${id}/rate`),
  capturePlaceSaved: vi.fn(),
  feedItemHasPhotos: vi.fn(() => false),
  detailPlaceHasPhotos: vi.fn(() => false),
}))

vi.mock('@/lib/authGate', () => ({
  ensureAuthForGatedAction: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/gatedAction', () => ({
  tryCaptureGatedActionCompleted: vi.fn(),
}))

vi.mock('@/lib/openingHours', () => ({
  deriveOpeningState: vi.fn(() => null),
  hasOpenLate: vi.fn(() => false),
}))

vi.mock('@/components/places/PlaceDetailCta', () => ({
  PlaceDetailCta: () => <div data-testid="place-detail-cta" />,
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-0000-0000-000000000001'

function makePlaceDetail(overrides: Partial<PlaceDetailResponse> = {}): PlaceDetailResponse {
  return {
    place: {
      id: VALID_UUID,
      name: 'Detail Cafe',
      address: '99 Test Rd',
      lat: 38.88,
      lng: -77.09,
      place_type: 'cafe',
      opening_hours: null,
      timezone: null,
      google_photo_ref: null,
      vibe_photo_path: null,
      vibe_photo_ref: null,
      vibe_photo_attribution: null,
    },
    place_stats: {
      rating_count: 8,
      avg_overall_rating: 4.2,
      noise_silent: 1,
      noise_quiet: 5,
      noise_vibrant: 2,
      vibe_focused: 4,
      vibe_casual: 3,
      vibe_social: 1,
      tables_limited: 1,
      tables_mixed: 4,
      tables_plentiful: 3,
      outlets_scarce: 0,
      outlets_some: 3,
      outlets_ample: 5,
    },
    notes: [],
    is_saved: false,
    my_rating: null,
    ...overrides,
  }
}

function makeFeedPreview(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: VALID_UUID,
    name: 'Detail Cafe',
    address: '99 Test Rd',
    lat: 38.88,
    lng: -77.09,
    place_type: 'cafe',
    noise: 'Quiet',
    tables: 'mixed',
    outlets: 'some',
    match_score_percent: 80,
    why_matched: [],
    open_now: false,
    closes_at: null,
    closing_soon: false,
    open_late: false,
    pills: [],
    is_favorited: false,
    user_has_rated: false,
    rating_count: 8,
    ...overrides,
  }
}

function setupFetch(detail: PlaceDetailResponse, photoUrls: string[] = []) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/user-photos')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ urls: photoUrls }),
      })
    }
    // place detail endpoint
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: detail }),
    })
  })
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

async function renderPanel(
  detail: PlaceDetailResponse,
  photoUrls: string[] = [],
  previewFeedItem?: FeedItem,
) {
  setupFetch(detail, photoUrls)
  const { DesktopPlaceDetailPanel } = await import(
    '@/components/feed/DesktopPlaceDetailPanel'
  )
  const center = { lat: 38.88, lng: -77.09 }
  await act(async () => {
    render(
      <DesktopPlaceDetailPanel
        placeId={VALID_UUID}
        initialCenter={center}
        previewFeedItem={previewFeedItem}
      />,
      { wrapper: makeWrapper() },
    )
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DesktopPlaceDetailPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the place name', async () => {
    await renderPanel(makePlaceDetail())
    await waitFor(() => {
      expect(screen.getByText('Detail Cafe')).toBeInTheDocument()
    })
  })

  it('renders the place name from previewFeedItem while detail loads', async () => {
    // Feed preview is shown immediately without waiting for the query
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { DesktopPlaceDetailPanel } = await import(
      '@/components/feed/DesktopPlaceDetailPanel'
    )
    await act(async () => {
      render(
        <DesktopPlaceDetailPanel
          placeId={VALID_UUID}
          initialCenter={{ lat: 38.88, lng: -77.09 }}
          previewFeedItem={makeFeedPreview({ name: 'Preview Cafe' })}
        />,
        { wrapper: makeWrapper() },
      )
    })
    expect(screen.getByText('Preview Cafe')).toBeInTheDocument()
  })

  it('renders notes when present', async () => {
    const detail = makePlaceDetail({
      notes: [
        {
          id: 'note-1',
          rater_id: 'user-1',
          notes: 'Great power outlets near the window!',
          created_at: new Date().toISOString(),
          author_short_name: 'Alice',
        },
      ],
    })
    await renderPanel(detail)
    await waitFor(() => {
      expect(screen.getByText('Great power outlets near the window!')).toBeInTheDocument()
    })
  })

  it('renders empty reviews state when notes array is empty', async () => {
    await renderPanel(makePlaceDetail({ notes: [] }))
    await waitFor(() => {
      expect(screen.getByText('No notes yet.')).toBeInTheDocument()
    })
  })

  it('renders "Be the first to rate this place!" when rating_count is 0', async () => {
    const detail = makePlaceDetail({
      place_stats: {
        ...makePlaceDetail().place_stats,
        rating_count: 0,
        avg_overall_rating: null,
      },
    })
    await renderPanel(detail)
    await waitFor(() => {
      expect(
        screen.getByText('Be the first to rate this place!'),
      ).toBeInTheDocument()
    })
  })

  it('renders photo strip when user photos are available', async () => {
    const photos = [
      '/api/storage/user-photos/img1.jpg',
      '/api/storage/user-photos/img2.jpg',
    ]
    await renderPanel(makePlaceDetail(), photos)
    await waitFor(() => {
      const images = document.querySelectorAll('button[aria-label^="View photo"]')
      expect(images.length).toBe(2)
    })
  })

  it('does not render photo strip when no photos are available', async () => {
    await renderPanel(makePlaceDetail(), [])
    await waitFor(() => {
      expect(
        document.querySelectorAll('button[aria-label^="View photo"]'),
      ).toHaveLength(0)
    })
  })

  it('renders the bookmark button', async () => {
    await renderPanel(makePlaceDetail({ is_saved: false }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /save detail cafe/i }),
      ).toBeInTheDocument()
    })
  })

  it('bookmark button shows remove label when place is saved', async () => {
    await renderPanel(makePlaceDetail({ is_saved: true }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /remove detail cafe from saved/i }),
      ).toBeInTheDocument()
    })
  })

  it('clicking bookmark on unsaved place calls POST /api/saved', async () => {
    setupFetch(makePlaceDetail({ is_saved: false }))
    const { DesktopPlaceDetailPanel } = await import(
      '@/components/feed/DesktopPlaceDetailPanel'
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    await act(async () => {
      render(
        <DesktopPlaceDetailPanel
          placeId={VALID_UUID}
          initialCenter={{ lat: 38.88, lng: -77.09 }}
        />,
        { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> },
      )
    })

    await waitFor(() =>
      screen.getByRole('button', { name: /save detail cafe/i }),
    )

    fireEvent.click(screen.getByRole('button', { name: /save detail cafe/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/saved',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('renders the PlaceDetailCta dock at the bottom', async () => {
    await renderPanel(makePlaceDetail())
    await waitFor(() => {
      expect(screen.getByTestId('place-detail-cta')).toBeInTheDocument()
    })
  })
})
