import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '@/components/ui/Toast'

function Trigger({ message, tone }: { message: string; tone?: 'error' | 'success' }) {
  const { showToast } = useToast()
  return (
    <button type="button" onClick={() => showToast(message, tone)}>
      fire
    </button>
  )
}

/**
 * Item 11 — optimistic rollbacks used to revert silently. The toast is the
 * shared surface those failures report through.
 */
describe('Toast', () => {
  it('shows a message and announces it politely', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Couldn't save that place" />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'fire' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent("Couldn't save that place")
  })

  it('can be dismissed', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Something failed" />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'fire' }))
    expect(await screen.findByText('Something failed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Something failed')).not.toBeInTheDocument()
  })

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <Trigger message="Temporary problem" />
        </ToastProvider>,
      )

      // fireEvent rather than userEvent: userEvent's own timers fight fake ones.
      fireEvent.click(screen.getByRole('button', { name: 'fire' }))
      expect(screen.getByText('Temporary problem')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(5100)
      })
      expect(screen.queryByText('Temporary problem')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('is a no-op outside the provider so isolated components still render', () => {
    // Deliberate: avoids rewiring every existing test wrapper.
    expect(() => render(<Trigger message="ignored" />)).not.toThrow()
  })
})
