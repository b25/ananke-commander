import type { StateCreator } from 'zustand'
import type { AppStore, UiSlice } from './types'

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  sidebarTab: 'collections',
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
})
