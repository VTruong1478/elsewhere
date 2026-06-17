/**
 * Tests for the ResetPasswordPage component.
 *
 * The page renders content twice — once in the mobile layout (lg:hidden) and
 * once in the desktop layout (hidden lg:block). jsdom does not apply CSS so
 * both copies are visible during tests. Use getAllBy* for elements that appear
 * in both layouts, and queryBy* to assert absence.
 *
 * The Supabase PASSWORD_RECOVERY flow is asynchronous: the client parses the
 * URL hash fragment and fires onAuthStateChange. Tests trigger that callback
 * manually via the captured reference. The expiry timeout test uses fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Supabase mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'

// ── next/navigation mock ──────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/reset-password'),
}))

// ── next/link mock ────────────────────────────────────────────────────────────

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

// ── window.location mock ──────────────────────────────────────────────────────

const mockAssign = vi.fn()
Object.defineProperty(window, 'location', {
  value: { assign: mockAssign, origin: 'http://localhost:3000' },
  writable: true,
  configurable: true,
})

// ── Page under test ───────────────────────────────────────────────────────────

import ResetPasswordPage from '@/app/reset-password/page'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ResetPasswordPage', () => {
  // Captured reference to the onAuthStateChange callback so tests can fire it.
  let triggerAuthEvent: (event: string, session: unknown) => void

  let mockUpdateUser: ReturnType<typeof vi.fn>
  let mockGetSession: ReturnType<typeof vi.fn>
  let mockUnsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockAssign.mockClear()
    mockUpdateUser = vi.fn().mockResolvedValue({ data: {}, error: null })
    mockGetSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    mockUnsubscribe = vi.fn()

    vi.mocked(createClient).mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn((cb) => {
          triggerAuthEvent = cb
          return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
        }),
        updateUser: mockUpdateUser,
        getSession: mockGetSession,
      },
    } as ReturnType<typeof createClient>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ── 1. Loading state ────────────────────────────────────────────────────────

  it('shows a loading state on initial render before any auth event fires', () => {
    render(<ResetPasswordPage />)

    expect(
      screen.getAllByText(/verifying reset link/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /set new password/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/link expired/i)).not.toBeInTheDocument()
  })

  // ── 2. PASSWORD_RECOVERY event shows the form ───────────────────────────────

  it('shows the reset password form when PASSWORD_RECOVERY event fires', async () => {
    render(<ResetPasswordPage />)

    await act(async () => {
      triggerAuthEvent('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    })

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /set new password/i }).length,
      ).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/verifying/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/link expired/i)).not.toBeInTheDocument()
  })

  // ── 3. Expiry timeout ───────────────────────────────────────────────────────

  it('shows the expired link error if no PASSWORD_RECOVERY event fires within 5 seconds', () => {
    vi.useFakeTimers()

    render(<ResetPasswordPage />)

    // Advance past the 5 s expiry threshold; synchronous act flushes the
    // resulting React state update without relying on real-timer polling.
    act(() => {
      vi.advanceTimersByTime(5001)
    })

    expect(screen.getAllByText(/link expired/i).length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /set new password/i }),
    ).not.toBeInTheDocument()
  })

  // ── 4. Password mismatch validation ────────────────────────────────────────

  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordPage />)

    await act(async () => {
      triggerAuthEvent('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    })

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('New password').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getAllByPlaceholderText('New password')[0], {
      target: { value: 'password123' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new password')[0], {
      target: { value: 'differentpass' },
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: /set new password/i })[0],
    )

    await waitFor(() => {
      expect(
        screen.getAllByText(/passwords do not match/i).length,
      ).toBeGreaterThan(0)
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  // ── 5. Minimum length validation ───────────────────────────────────────────

  it('shows an error when the password is shorter than 8 characters', async () => {
    render(<ResetPasswordPage />)

    await act(async () => {
      triggerAuthEvent('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    })

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('New password').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getAllByPlaceholderText('New password')[0], {
      target: { value: 'short' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new password')[0], {
      target: { value: 'short' },
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: /set new password/i })[0],
    )

    await waitFor(() => {
      expect(
        screen.getAllByText(/at least 8 characters/i).length,
      ).toBeGreaterThan(0)
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  // ── 6. Calls updateUser on valid submit ────────────────────────────────────

  it('calls supabase.auth.updateUser with the new password on valid submit', async () => {
    render(<ResetPasswordPage />)

    await act(async () => {
      triggerAuthEvent('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    })

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('New password').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getAllByPlaceholderText('New password')[0], {
      target: { value: 'newpassword123' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new password')[0], {
      target: { value: 'newpassword123' },
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: /set new password/i })[0],
    )

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    })
  })

  // ── 7. Redirects to /login on success ──────────────────────────────────────

  it('redirects to /login after a successful password update', async () => {
    render(<ResetPasswordPage />)

    await act(async () => {
      triggerAuthEvent('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    })

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('New password').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getAllByPlaceholderText('New password')[0], {
      target: { value: 'newpassword123' },
    })
    fireEvent.change(screen.getAllByPlaceholderText('Confirm new password')[0], {
      target: { value: 'newpassword123' },
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: /set new password/i })[0],
    )

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith(
        expect.stringContaining('/login'),
      )
    })
  })
})
