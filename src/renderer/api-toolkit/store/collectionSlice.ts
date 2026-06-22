import type { StateCreator } from 'zustand'
import type { RequestItem } from '../../../shared/api-toolkit-contracts'
import type { AppStore, CollectionSlice } from './types'

export const createCollectionSlice: StateCreator<AppStore, [], [], CollectionSlice> = (set, get) => ({
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],

  setCollections: (collections) => set({ collections }),
  setEnvironments: (environments) => set({ environments }),
  setHistory: (history) => set({ history }),
  addHistoryEntry: (entry) => set((s) => ({ history: [entry, ...s.history].slice(0, 500) })),
  clearHistory: () => set({ history: [] }),
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
})
