import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/analytics', () => ({
  captureEvent: vi.fn(),
  parseAnalyticsSource: () => 'feed',
}))

/**
 * Item 12 — a failed submit was console.error-only, leaving the modal open with
 * no message and no explanation. Network rejections were not caught at all.
 */
describe('AddMissingPlaceModal submit failures', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  async function fillAndSubmit() {
    const { AddMissingPlaceModal } = await import(
      '@/components/feed/AddMissingPlaceModal'
    )
    render(<AddMissingPlaceModal open onClose={() => {}} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/place name/i), 'Test Cafe')
    await user.type(screen.getByLabelText(/address/i), '123 Main St')

    const select = screen.getByLabelText(/type/i) as HTMLSelectElement
    await user.selectOptions(select, select.options[1].value)

    await user.click(screen.getByRole('button', { name: /^submit$/i }))
  }

  it('shows the server error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server exploded' }),
    }) as unknown as typeof fetch

    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server exploded')
  })

  it('shows a connection message when the request rejects', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch

    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't reach the server/i)
  })

  it('falls back to a generic message when the body has no error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch

    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't submit that place/i)
  })
})
