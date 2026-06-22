import { useEffect } from 'react'
import type { Tab } from '../../store'
import { useStore } from '../../store'
import { loadResponseViewPrefs, tabResponseViewRaw } from '../../lib/responseViewPrefs'

export function useResponseViewPref(tab: Tab) {
  const { responseViewRaw, setTabResponseViewRaw } = useStore()

  // Re-apply persisted preference when switching tabs (store is module-singleton).
  useEffect(() => {
    if (tab.protocol !== 'http') return
    if (tab.responseViewRaw !== undefined) return
    const prefs = loadResponseViewPrefs()
    if (prefs.remember) setTabResponseViewRaw(tab.id, prefs.raw)
  }, [tab.id, tab.protocol, tab.responseViewRaw, setTabResponseViewRaw])

  return {
    viewRaw: tabResponseViewRaw(tab, responseViewRaw),
    toggleView: () => setTabResponseViewRaw(tab.id, !tabResponseViewRaw(tab, responseViewRaw)),
  }
}
