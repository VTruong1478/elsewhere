import { vi } from 'vitest'

// Container set by the MockMap constructor; used by MockMarker.addTo
let _mapContainer: HTMLElement | null = null

// Shared mock map instance returned by `new mapboxgl.Map(...)`
export const mockMapInstance = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  remove: vi.fn(),
  getZoom: vi.fn().mockReturnValue(12),
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  touchZoomRotate: { disableRotation: vi.fn() },
  getContainer: vi.fn(() => _mapContainer ?? document.createElement('div')),
}

// Instances created during a test — inspectable from test code
export const createdMarkers: Array<{
  element: HTMLElement
  lngLat: [number, number]
}> = []

export function resetMapboxMocks() {
  createdMarkers.length = 0
  _mapContainer = null
  Object.values(mockMapInstance).forEach((v) => {
    if (v && typeof v === 'object') {
      Object.values(v).forEach((fn) => {
        if (fn && typeof fn === 'function' && 'mockReset' in fn) fn.mockReset()
      })
    }
    if (typeof v === 'function' && 'mockReset' in v) v.mockReset()
  })
  mockMapInstance.on.mockReturnThis()
  mockMapInstance.off.mockReturnThis()
  mockMapInstance.getZoom.mockReturnValue(12)
  mockMapInstance.getContainer.mockImplementation(
    () => _mapContainer ?? document.createElement('div'),
  )
  mockMapInstance.touchZoomRotate.disableRotation = vi.fn()
}

// MockMap: class so `new mapboxgl.Map(options)` works as a constructor.
// Returns the shared mockMapInstance object (JS allows returning a non-primitive
// from a constructor to replace `this`).
class MockMap {
  constructor(options: { container: HTMLElement; [key: string]: unknown }) {
    _mapContainer = options.container
    mockMapInstance.getContainer.mockReturnValue(options.container)
    // Copy shared mock methods onto this instance so callers get the same spies
    Object.assign(this, mockMapInstance)
  }
}

// MockMarker: appends element to map container so pointerup events are dispatchable
class MockMarker {
  element: HTMLElement
  private _lngLat: [number, number] = [0, 0]

  constructor({ element }: { element: HTMLElement; anchor?: string }) {
    this.element = element
  }

  setLngLat(lngLat: [number, number]) {
    this._lngLat = lngLat
    return this
  }

  addTo(_map: unknown) {
    // Append to map container so tests can find and interact with marker elements
    if (_mapContainer) {
      _mapContainer.appendChild(this.element)
    }
    createdMarkers.push({ element: this.element, lngLat: this._lngLat })
    return this
  }

  remove() {
    this.element.parentNode?.removeChild(this.element)
    return this
  }

  getElement() {
    return this.element
  }
}

class MockLngLatBounds {
  extend(_coord: [number, number]) {
    return this
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapboxMock: any = {
  Map: MockMap,
  Marker: MockMarker,
  LngLatBounds: MockLngLatBounds,
  accessToken: '',
}

export default mapboxMock
