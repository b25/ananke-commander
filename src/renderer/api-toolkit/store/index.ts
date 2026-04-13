import { create } from 'zustand'
import type {
  HttpRequest, HttpResponse, GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus,
  Collection, Environment, HistoryEntry, KeyValue, HttpBody, AuthConfig, TlsConfig, ProtoDiscovery,
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
  sidebarTab: 'collections' | 'history'

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
  setSidebarTab: (t: 'collections' | 'history') => void
  setActiveEnvironment: (id: string | null) => void
}

export const useStore = create<AppState>((set, get) => ({
  tabs: [newTab()],
  activeTabId: null,
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  sidebarTab: 'collections',

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
        t.id === tabId ? { ...t, grpcMessages: [...t.grpcMessages, msg] } : t
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
}))

// Helper: get active tab
export function useActiveTab(): Tab | undefined {
  return useStore((s) => s.tabs.find((t) => t.id === (s.activeTabId ?? s.tabs[0]?.id)))
}
