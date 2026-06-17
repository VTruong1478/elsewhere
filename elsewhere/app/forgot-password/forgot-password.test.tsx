/**
 * Tests for the ForgotPasswordPage component.
 *
 * The page renders its content twice — once inside the mobile layout
 * (lg:hidden) and once inside the desktop layout (hidden lg:block). jsdom
 * does not apply CSS, so both copies are visible during tests. Queries that
 * expect a single element use [0] on getAllBy results; assertions about
 * absence use queryBy which returns null if zero elements match.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Supabase mock (must appear before the import that uses it) ───────────────

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'

// ── next/navigation mock ─────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/forgot-password'),
}))

import { useSearchParams } from 'next/navigation'

// ── next/link mock ───────────────────────────────────────────────────────────

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

// ── Page under test ──────────────────────────────────────────────────────────

import ForgotPasswordPage from '@/app/forgot-password/page'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage', () => {
  let mockResetPasswordForEmail: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockResetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: {}, error: null })

    vi.mocked(createClient).mockReturnValue({
      auth: {
        resetPasswordForEmail: mockResetPasswordForEmail,
      },
    } as ReturnType<typeof createClient>)

    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an email input and "Send reset link" button', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getAllByPlaceholderText('Email').length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('button', { name: /send reset link/i }).length,
    ).toBeGreaterThan(0)
  })

  it('shows a validation error when submitted with an empty email field', async () => {
    render(<ForgotPasswordPage />)

    fireEvent.click(screen.getAllByRole('button', { name: /send reset link/i })[0])

    await waitFor(() => {
      expect(
        screen.getAllByText(/please enter your email address/i).length,
      ).toBeGreaterThan(0)
    })

    expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('calls resetPasswordForEmail with the trimmed, lowercased email', async () => {
    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], {
      target: { value: '  Elsewhere.App.Team@Gmail.com  ' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /send reset link/i })[0])

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'elsewhere.app.team@gmail.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/reset-password'),
        }),
      )
    })
  })

  it('hides the form and shows "Check your email for a reset link." after a successful submit', async () => {
    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], {
      target: { value: 'elsewhere.app.team@gmail.com' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /send reset link/i })[0])

    await waitFor(() => {
      expect(
        screen.getAllByText(/check your email for a reset link\./i).length,
      ).toBeGreaterThan(0)
    })

    expect(
      screen.queryByRole('button', { name: /send reset link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows an inline error message when resetPasswordForEmail returns an error', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { message: 'Unable to send reset email' },
    })

    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], {
      target: { value: 'elsewhere.app.team@gmail.com' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /send reset link/i })[0])

    await waitFor(() => {
      expect(
        screen.getAllByText('Unable to send reset email').length,
      ).toBeGreaterThan(0)
    })

    // Form should still be visible so the user can correct and retry
    expect(
      screen.getAllByRole('button', { name: /send reset link/i }).length,
    ).toBeGreaterThan(0)
  })

  it('"Back to login" links point to /login', () => {
    render(<ForgotPasswordPage />)

    const links = screen.getAllByRole('link', { name: /back to login/i })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/login'))
  })

  it('appends ?next= to the redirectTo when the query param is present in the URL', async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('next=/places/abc123') as unknown as ReturnType<
        typeof useSearchParams
      >,
    )

    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], {
      target: { value: 'elsewhere.app.team@gmail.com' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /send reset link/i })[0])

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'elsewhere.app.team@gmail.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('next='),
        }),
      )
    })
  })
})
