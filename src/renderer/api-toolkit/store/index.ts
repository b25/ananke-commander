import { create } from 'zustand'
import type {
  HttpRequest, HttpResponse, GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus,
  Collection, CollectionItem, RequestItem, Environment, HistoryEntry, KeyValue, HttpBody, AuthConfig, TlsConfig, ProtoDiscovery,
  MockRoute, MockServerData,
} from '../../../shared/api-toolkit-contracts'

export type Protocol = 'http' | 'grpc'

export interface Tab {
  id: string
  name: string
  protocol: Protocol
  httpRequest: HttpRequest
  grpcRequest: GrpcRequest
  httpResponse: HttpResponse | null
  grpcResponse: GrpcResponse | null
  grpcMessages: GrpcMessage[]
  grpcStreamStatus: GrpcStatus | null
  grpcStreamActive: boolean
  grpcDiscovery: ProtoDiscovery | null
  loading: boolean
  error: string | null
  collectionId?: string
  requestId?: string
  dirty: boolean
}

function defaultHttpRequest(): HttpRequest {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [{ key: 'Accept', value: '*/*', enabled: true }],
    body: { mode: 'none' },
    auth: { type: 'none' },
    timeout: 30000,
  }
}

function defaultGrpcRequest(): GrpcRequest {
  return {
    endpoint: 'localhost:50051',
    serviceMethod: '',
    messageJson: '{}',
    metadata: [],
    tls: { mode: 'none' },
    protoSource: { type: 'text', content: '' },
    deadline: 0,
  }
}

function newTab(overrides?: Partial<Tab>): Tab {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    protocol: 'http',
    httpRequest: defaultHttpRequest(),
    grpcRequest: defaultGrpcRequest(),
    httpResponse: null,
    grpcResponse: null,
    grpcMessages: [],
    grpcStreamStatus: null,
    grpcStreamActive: false,
    grpcDiscovery: null,
    loading: false,
    error: null,
    dirty: false,
    ...overrides,
  }
}

interface AppState {
  tabs: Tab[]
  activeTabId: string | null
  collections: Collection[]
  environments: Environment[]
  activeEnvironmentId: string | null
  history: HistoryEntry[]
  sidebarTab: 'collections' | 'history' | 'environments' | 'mock'

  // Tab actions
  openTab: (overrides?: Partial<Tab>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Tab>) => void

  // HTTP request mutations
  setHttpMethod: (tabId: string, method: HttpRequest['method']) => void
  setHttpUrl: (tabId: string, url: string) => void
  setHttpParams: (tabId: string, params: KeyValue[]) => void
  setHttpHeaders: (tabId: string, headers: KeyValue[]) => void
  setHttpBody: (tabId: string, body: HttpBody) => void
  setHttpAuth: (tabId: string, auth: AuthConfig) => void

  // gRPC request mutations
  setGrpcEndpoint: (tabId: string, endpoint: string) => void
  setGrpcServiceMethod: (tabId: string, serviceMethod: string) => void
  setGrpcMessageJson: (tabId: string, json: string) => void
  setGrpcMetadata: (tabId: string, metadata: KeyValue[]) => void
  setGrpcTls: (tabId: string, tls: TlsConfig) => void
  setGrpcDiscovery: (tabId: string, discovery: ProtoDiscovery) => void
  addGrpcStreamMessage: (tabId: string, msg: GrpcMessage) => void
  endGrpcStream: (tabId: string, status: GrpcStatus, trailers: Record<string, string>) => void

  // Storage
  setCollections: (cols: Collection[]) => void
  setEnvironments: (envs: Environment[]) => void
  setHistory: (h: HistoryEntry[]) => void
  addHistoryEntry: (entry: HistoryEntry) => void
  clearHistory: () => void
  setSidebarTab: (t: 'collections' | 'history' | 'environments' | 'mock') => void
  setActiveEnvironment: (id: string | null) => void

  // Collection item CRUD
  addItemToCollection: (colId: string, item: CollectionItem, parentId?: string) => Promise<void>
  updateCollectionItem: (colId: string, itemId: string, patch: Partial<CollectionItem>) => Promise<void>
  removeCollectionItem: (colId: string, itemId: string) => Promise<void>
  saveTabToCollection: (tabId: string) => Promise<void>
  importPostmanCollection: (jsonStr: string) => Promise<{ count: number }>

  // Mock proxy server
  mockData: MockServerData
  mockRunning: boolean
  mockActualPort: number | null
  setMockData: (d: MockServerData) => void
  setMockRunning: (r: boolean) => void
  setMockActualPort: (p: number | null) => void
  saveMockData: (d: MockServerData) => Promise<void>
  startMock: () => Promise<void>
  stopMock: () => Promise<void>
  updateRouteHitCount: (routeId: string, hitCount: number) => void
}

export const useStore = create<AppState>((set, get) => ({
  tabs: [newTab()],
  activeTabId: null,
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  sidebarTab: 'collections',
  mockData: { port: 3001, routes: [] },
  mockRunning: false,
  mockActualPort: null,

  openTab: (overrides) => {
    const tab = newTab(overrides)
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },

  closeTab: (id) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      if (tabs.length === 0) {
        const fresh = newTab()
        return { tabs: [fresh], activeTabId: fresh.id }
      }
      const newActive = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId
      return { tabs, activeTabId: newActive }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  setHttpMethod: (tabId, method) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, method }, dirty: true })
  },

  setHttpUrl: (tabId, url) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    const name = url || 'New Request'
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, url }, name, dirty: true })
  },

  setHttpParams: (tabId, params) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, params }, dirty: true })
  },

  setHttpHeaders: (tabId, headers) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, headers }, dirty: true })
  },

  setHttpBody: (tabId, body) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, body }, dirty: true })
  },

  setHttpAuth: (tabId, auth) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { httpRequest: { ...tab.httpRequest, auth }, dirty: true })
  },

  setGrpcEndpoint: (tabId, endpoint) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { grpcRequest: { ...tab.grpcRequest, endpoint }, dirty: true })
  },

  setGrpcServiceMethod: (tabId, serviceMethod) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { grpcRequest: { ...tab.grpcRequest, serviceMethod }, dirty: true })
  },

  setGrpcMessageJson: (tabId, messageJson) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { grpcRequest: { ...tab.grpcRequest, messageJson }, dirty: true })
  },

  setGrpcMetadata: (tabId, metadata) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { grpcRequest: { ...tab.grpcRequest, metadata }, dirty: true })
  },

  setGrpcTls: (tabId, tls) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    get().updateTab(tabId, { grpcRequest: { ...tab.grpcRequest, tls }, dirty: true })
  },

  setGrpcDiscovery: (tabId, discovery) => get().updateTab(tabId, { grpcDiscovery: discovery }),

  addGrpcStreamMessage: (tabId, msg) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, grpcMessages: [...t.grpcMessages, msg].slice(-500) } : t
      ),
    })),

  endGrpcStream: (tabId, status, trailers) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, grpcStreamActive: false, grpcStreamStatus: status, loading: false,
              grpcResponse: { messages: t.grpcMessages, status, metadata: {}, trailers, timings: { total: 0 } } }
          : t
      ),
    })),

  setCollections: (collections) => set({ collections }),
  setEnvironments: (environments) => set({ environments }),
  setHistory: (history) => set({ history }),
  addHistoryEntry: (entry) => set((s) => ({ history: [entry, ...s.history].slice(0, 500) })),
  clearHistory: () => set({ history: [] }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setActiveEnvironment: (activeEnvironmentId) => set({ activeEnvironmentId }),

  addItemToCollection: async (colId, item, parentId) => {
    const updated = await window.ananke.apiToolkit.storage.addCollectionItem(colId, item, parentId)
    if (updated) set((s) => ({ collections: s.collections.map((c) => c.id === colId ? updated : c) }))
  },

  updateCollectionItem: async (colId, itemId, patch) => {
    const updated = await window.ananke.apiToolkit.storage.updateCollectionItem(colId, itemId, patch)
    if (updated) set((s) => ({ collections: s.collections.map((c) => c.id === colId ? updated : c) }))
  },

  removeCollectionItem: async (colId, itemId) => {
    const updated = await window.ananke.apiToolkit.storage.deleteCollectionItem(colId, itemId)
    if (updated) set((s) => ({ collections: s.collections.map((c) => c.id === colId ? updated : c) }))
  },

  saveTabToCollection: async (tabId) => {
    const { tabs, collections } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab?.collectionId || !tab.requestId) return
    const col = collections.find((c) => c.id === tab.collectionId)
    if (!col) return
    const patch: Partial<RequestItem> = {
      name: tab.name,
      protocol: tab.protocol,
      httpRequest: tab.httpRequest,
      grpcRequest: tab.grpcRequest,
    }
    const updated = await window.ananke.apiToolkit.storage.updateCollectionItem(tab.collectionId, tab.requestId, patch)
    if (updated) {
      set((s) => ({
        collections: s.collections.map((c) => c.id === tab.collectionId ? updated : c),
        tabs: s.tabs.map((t) => t.id === tabId ? { ...t, dirty: false } : t),
      }))
    }
  },

  importPostmanCollection: async (jsonStr) => {
    const result = await window.ananke.apiToolkit.storage.importCollection(jsonStr)
    set((s) => ({ collections: [...s.collections, result.collection] }))
    return { count: result.count }
  },

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
      // Persist updated hit counts to disk
      window.ananke.apiToolkit.mock.saveData(mockData).catch(console.error)
      return { mockData }
    }),
}))

// Helper: get active tab
export function useActiveTab(): Tab | undefined {
  return useStore((s) => s.tabs.find((t) => t.id === (s.activeTabId ?? s.tabs[0]?.id)))
}
