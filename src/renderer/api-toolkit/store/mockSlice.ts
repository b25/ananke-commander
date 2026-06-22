import type { StateCreator } from 'zustand'
import type { MockServerData } from '../../../shared/api-toolkit-contracts'
import type { AppStore, MockSlice } from './types'

let mockPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingMockPersist: MockServerData | null = null

function scheduleMockPersist(data: MockServerData): void {
  pendingMockPersist = data
  if (mockPersistTimer) clearTimeout(mockPersistTimer)
  mockPersistTimer = setTimeout(() => {
    const toPersist = pendingMockPersist
    pendingMockPersist = null
    mockPersistTimer = null
    if (!toPersist) return
    window.ananke.apiToolkit.mock.saveData(toPersist).catch(console.error)
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
      scheduleMockPersist(mockData)
      return { mockData }
    }),
})
