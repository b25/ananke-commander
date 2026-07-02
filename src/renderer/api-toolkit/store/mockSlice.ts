import type { StateCreator } from 'zustand'
import type { MockServerData } from '../../../shared/api-toolkit-contracts'
import type { AppStore, MockSlice } from './types'

let mockPersistTimer: ReturnType<typeof setTimeout> | null = null

// Accept a getter so the timer reads the CURRENT state at fire time, not a stale
// snapshot captured when the debounce was scheduled.  This prevents a route hit
// (which schedules write X) from overwriting a user edit (write Y) that arrives
// within the 300 ms window.
function scheduleMockPersist(getMockData: () => MockServerData): void {
  if (mockPersistTimer) clearTimeout(mockPersistTimer)
  mockPersistTimer = setTimeout(() => {
    mockPersistTimer = null
    window.ananke.apiToolkit.mock.saveData(getMockData()).catch(console.error)
  }, 300)
}

export const createMockSlice: StateCreator<AppStore, [], [], MockSlice> = (set, get) => ({
  mockData: { port: 3001, routes: [] },
  mockRunning: false,
  mockActualPort: null,

  setMockData: (mockData) => set({ mockData }),
  setMockRunning: (mockRunning) => set({ mockRunning }),
  setMockActualPort: (mockActualPort) => set({ mockActualPort }),

  saveMockData: async (data) => {
    await window.ananke.apiToolkit.mock.saveData(data)
    set({ mockData: data })
  },

  startMock: async () => {
    const { mockData } = get()
    const result = await window.ananke.apiToolkit.mock.start(mockData.port, mockData.routes)
    set({ mockRunning: true, mockActualPort: result.port })
  },

  stopMock: async () => {
    await window.ananke.apiToolkit.mock.stop()
    set({ mockRunning: false, mockActualPort: null })
  },

  updateRouteHitCount: (routeId, hitCount) =>
    set((s) => {
      const routes = s.mockData.routes.map((r) =>
        r.id === routeId ? { ...r, hitCount } : r
      )
      const mockData = { ...s.mockData, routes }
      scheduleMockPersist(() => get().mockData)
      return { mockData }
    }),
})
