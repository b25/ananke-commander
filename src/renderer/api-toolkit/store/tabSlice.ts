import type { StateCreator } from 'zustand'
import type { HttpRequest, GrpcRequest } from '../../../shared/api-toolkit-contracts'
import { loadResponseViewPrefs, saveResponseViewPrefs } from '../lib/responseViewPrefs'
import type { AppStore, Tab, TabSlice } from './types'

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

export function newTab(overrides?: Partial<Tab>): Tab {
  const viewPrefs = loadResponseViewPrefs()
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
    responseViewRaw: viewPrefs.raw,
    ...overrides,
  }
}

export const createTabSlice: StateCreator<AppStore, [], [], TabSlice> = (set, get) => ({
  tabs: [newTab()],
  activeTabId: null,
  responseViewRaw: loadResponseViewPrefs().raw,

  setTabResponseViewRaw: (tabId, raw) => {
    set((s) => ({
      responseViewRaw: raw,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, responseViewRaw: raw } : t)),
    }))
    saveResponseViewPrefs({ raw, remember: true })
  },

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
})
