import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useUserLocation } from '@/hooks/useUserLocation'
import { captureEvent } from '@/lib/analytics'

vi.mock('@/lib/analytics', () => ({ captureEvent: vi.fn() }))

const KEY = 'elsewhere:lastCoords'
const DAY = 24 * 60 * 60 * 1000
const ANNANDALE = { lat: 38.8304, lng: -77.1941 }

const getCurrentPosition = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(captureEvent).mockReset()
  getCurrentPosition.mockReset()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
  // Force the "not granted" path so the silent refresh never runs; this is the
  // exact situation a revoked permission leaves a returning visitor in.
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
  })
})

afterEach(() => vi.useRealTimers())

describe('cached coordinates', () => {
  it('uses a fix saved a few minutes ago', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...ANNANDALE, ts: Date.now() - 5 * 60 * 1000 }),
    )
    const { result } = renderHook(() => useUserLocation({ autoRequest: false }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject(ANNANDALE)
  })

  it('discards a fix older than a day rather than reporting stale distances', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...ANNANDALE, ts: Date.now() - (DAY + 60_000) }),
    )
    const { result } = renderHook(() => useUserLocation({ autoRequest: false }))
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('discards a legacy entry with no timestamp, whose age is unknowable', async () => {
    window.localStorage.setItem(KEY, JSON.stringify(ANNANDALE))
    const { result } = renderHook(() => useUserLocation({ autoRequest: false }))
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('stamps a timestamp when it saves a fresh fix', async () => {
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition),
    )
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const saved = JSON.parse(window.localStorage.getItem(KEY) as string)
    expect(saved).toMatchObject({ lat: 1, lng: 2 })
    expect(typeof saved.ts).toBe('number')
  })
})

describe('permission analytics', () => {
  it('reports a real refusal as a denial', async () => {
    getCurrentPosition.mockImplementation(
      (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    )
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(captureEvent).toHaveBeenCalledWith('location_permission_denied')
  })

  it('does not call a slow reader a denial when the dialog is still open', async () => {
    vi.useFakeTimers()
    getCurrentPosition.mockImplementation(() => {
      /* dialog still open — neither callback fires */
    })
    const { result } = renderHook(() => useUserLocation())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    // Falling back to the regional view is right; recording a refusal is not.
    expect(result.current.status).toBe('denied')
    expect(captureEvent).toHaveBeenCalledWith('location_prompt_timed_out')
    expect(captureEvent).not.toHaveBeenCalledWith('location_permission_denied')
  })
})
