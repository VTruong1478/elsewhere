/**
 * Auth flow tests
 *
 * Signup/login pages render their form twice — once for the mobile layout and
 * once for the desktop layout (lg:hidden / hidden lg:block). So queries that
 * expect a single element use `getAllByRole(...)[0]` or check for `length > 0`.
 *
 * NOTE: The OAuth redirect flow (window.location.replace / window.location.assign)
 * is not exercised because jsdom does not implement navigation. Button rendering
 * and the gated-action function are tested instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Suspense } from 'react'

// createClient is mocked; import it here so vi.mocked() works
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'

// ── Other mocks ───────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/signup'),
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

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string
    alt: string
    [key: string]: unknown
  }) => <img src={src} alt={alt} {...props} />,
}))

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), identify: vi.fn() },
}))

vi.mock('@/lib/analytics', () => ({
  captureEvent: vi.fn(),
}))

vi.mock('@/lib/gatedAction', () => ({
  setOAuthAuthIntent: vi.fn(),
  persistPendingGatedAction: vi.fn(),
  peekPendingGatedAction: vi.fn(() => null),
  clearPendingGatedAction: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockAuthedClient() {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  } as ReturnType<typeof createClient>)
}

function mockUnauthClient() {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    },
  } as ReturnType<typeof createClient>)
}

// ── Signup page tests ─────────────────────────────────────────────────────────

describe('Signup page', () => {
  beforeEach(() => {
    mockUnauthClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders "Continue with Google" button', async () => {
    const SignupPage = (await import('@/app/signup/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <SignupPage />
        </Suspense>,
      )
    })
    // The page renders the form for both mobile and desktop layouts, so there
    // may be more than one button with this label.
    const buttons = screen.getAllByRole('button', { name: /continue with google/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders the email "Create account" button (default screen for unauthenticated users)', async () => {
    const SignupPage = (await import('@/app/signup/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <SignupPage />
        </Suspense>,
      )
    })
    const buttons = screen.getAllByRole('button', { name: /create account/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders the app headline', async () => {
    const SignupPage = (await import('@/app/signup/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <SignupPage />
        </Suspense>,
      )
    })
    expect(screen.getAllByText('elsewhere').length).toBeGreaterThan(0)
  })

  it('renders a "Log in" button to navigate to the login page', async () => {
    const SignupPage = (await import('@/app/signup/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <SignupPage />
        </Suspense>,
      )
    })
    expect(
      screen.getAllByRole('button', { name: /already have an account/i }).length,
    ).toBeGreaterThan(0)
  })
})

// ── Login page tests ──────────────────────────────────────────────────────────

describe('Login page', () => {
  beforeEach(() => {
    mockUnauthClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders "Continue with Google" button', async () => {
    const LoginPage = (await import('@/app/login/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <LoginPage />
        </Suspense>,
      )
    })
    const buttons = screen.getAllByRole('button', { name: /continue with google/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders the email "Log in" submit button', async () => {
    const LoginPage = (await import('@/app/login/page')).default
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <LoginPage />
        </Suspense>,
      )
    })
    // The login form submit button is labelled "Log in"
    const buttons = screen.getAllByRole('button', { name: /^log in$/i })
    expect(buttons.length).toBeGreaterThan(0)
  })
})

// ── ensureAuthForGatedAction tests ────────────────────────────────────────────

describe('ensureAuthForGatedAction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false and redirects to /signup?next=... when no session', async () => {
    mockUnauthClient()

    const { ensureAuthForGatedAction } = await import('@/lib/authGate')
    const navigate = vi.fn()

    const result = await ensureAuthForGatedAction(navigate, {
      action_type: 'save_place',
      source: 'feed',
      place_id: 'place-abc',
      place_name: 'Test Place',
      returnPath: '/feed',
    })

    expect(result).toBe(false)
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining('/signup?next='),
    )
  })

  it('returns true when a valid session exists', async () => {
    mockAuthedClient()

    const { ensureAuthForGatedAction } = await import('@/lib/authGate')
    const navigate = vi.fn()

    const result = await ensureAuthForGatedAction(navigate, {
      action_type: 'save_place',
      source: 'feed',
      place_id: 'place-abc',
      place_name: 'Test Place',
      returnPath: '/feed',
    })

    expect(result).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('encodes the returnPath in the redirect URL', async () => {
    mockUnauthClient()

    const { ensureAuthForGatedAction } = await import('@/lib/authGate')
    const navigate = vi.fn()

    await ensureAuthForGatedAction(navigate, {
      action_type: 'rate_place',
      source: 'feed',
      place_id: 'place-abc',
      place_name: 'Test Place',
      returnPath: '/feed?filter=quiet',
    })

    const redirectArg: string = navigate.mock.calls[0][0]
    expect(redirectArg).toContain(encodeURIComponent('/feed?filter=quiet'))
  })

  it('gated action persists returnPath before redirecting', async () => {
    mockUnauthClient()
    const { persistPendingGatedAction } = await import('@/lib/gatedAction')
    const { ensureAuthForGatedAction } = await import('@/lib/authGate')
    const navigate = vi.fn()

    await ensureAuthForGatedAction(navigate, {
      action_type: 'save_place',
      source: 'feed',
      place_id: 'place-abc',
      place_name: 'Test Place',
      returnPath: '/places/place-abc',
    })

    expect(vi.mocked(persistPendingGatedAction)).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'save_place',
        returnPath: '/places/place-abc',
      }),
    )
  })
})
