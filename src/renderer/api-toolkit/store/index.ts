import { create } from 'zustand'
import type { AppStore, Tab } from './types'
import { createTabSlice } from './tabSlice'
import { createCollectionSlice } from './collectionSlice'
import { createMockSlice } from './mockSlice'
import { createUiSlice } from './uiSlice'

export type { Tab, Protocol } from './types'

/**
 * Single API-toolkit store, composed from domain slices (tab / collection / mock / ui).
 * Slices share one `set`/`get` over the full `AppStore`, so cross-slice actions (e.g.
 * `saveTabToCollection` reading `tabs`) keep working. Consumers use `useStore` unchanged.
 */
export const useStore = create<AppStore>()((...a) => ({
  ...createTabSlice(...a),
  ...createCollectionSlice(...a),
  ...createMockSlice(...a),
  ...createUiSlice(...a),
}))

/** Helper: get the active tab. */
export function useActiveTab(): Tab | undefined {
  return useStore((s) => s.tabs.find((t) => t.id === (s.activeTabId ?? s.tabs[0]?.id)))
}
