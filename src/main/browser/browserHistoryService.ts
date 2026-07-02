import Store from 'electron-store'
import { isNavigationAllowed } from '../security/browserSecurity.js'
import { pruneHistories } from './browserHistoryPrune.js'

export type HistoryEntry = { url: string; timestamp: number }

type HistoryStoreSchema = { histories: Record<string, HistoryEntry[]> }

export type HistoryOptions = {
  maxEntries: () => number
  shouldRecord: () => boolean
  onHistory: (paneId: string, entries: HistoryEntry[]) => void
}

/**
 * Per-pane navigation history for embedded browser panes: in-memory list plus a
 * debounced, persisted `electron-store` mirror. Extracted from BrowserPaneManager so the
 * manager only owns native-view lifecycle.
 */
export class BrowserHistoryService {
  private histories = new Map<string, HistoryEntry[]>()
  private store: Store<HistoryStoreSchema>
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private opts: HistoryOptions

  constructor(opts: HistoryOptions) {
    this.opts = opts
    this.store = new Store<HistoryStoreSchema>({
      name: 'ananke-browser-history',
      defaults: { histories: {} }
    })
    // Restore persisted history into memory
    const saved = this.store.get('histories', {})
    for (const [paneId, entries] of Object.entries(saved)) {
      if (Array.isArray(entries) && entries.length > 0) {
        this.histories.set(paneId, entries)
      }
    }
  }

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      const obj: Record<string, HistoryEntry[]> = {}
      for (const [id, entries] of this.histories) {
        if (entries.length > 0) obj[id] = entries
      }
      this.store.set('histories', obj)
    }, 1000) // Debounce 1s
  }

  /** Record a navigation, applying privacy/scheme/dedup/cap rules, then notify + persist. */
  append(paneId: string, url: string): void {
    if (!this.opts.shouldRecord()) return
    if (!isNavigationAllowed(url)) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
    } catch {
      return
    }
    const max = Math.max(1, this.opts.maxEntries())
    let h = this.histories.get(paneId) ?? []
    if (h.length === 0 || h[h.length - 1].url !== url) {
      h = [...h, { url, timestamp: Date.now() }]
    }
    h = h.slice(-max)
    this.histories.set(paneId, h)
    this.opts.onHistory(paneId, h)
    this.persist()
  }

  get(paneId: string): HistoryEntry[] {
    return [...(this.histories.get(paneId) ?? [])]
  }

  clear(paneId: string): void {
    this.histories.set(paneId, [])
    this.opts.onHistory(paneId, [])
    this.persist()
  }

  /** Drop a pane's history entirely (on pane destroy). */
  delete(paneId: string): void {
    this.histories.delete(paneId)
    this.persist()
  }

  /**
   * Startup prune: remove history buckets for panes that no longer exist in
   * the persisted workspace state, then schedule a single persist. Called once
   * at app startup after both this service and the StateStore are ready.
   *
   * "Orphaned" means the paneId is not present in ANY workspace — not merely
   * off-screen or collapsed (those panes still exist in state and are kept).
   */
  pruneOrphans(livePaneIds: Set<string> | string[]): void {
    const liveSet = livePaneIds instanceof Set ? livePaneIds : new Set(livePaneIds)
    const pruned = pruneHistories(Object.fromEntries(this.histories), liveSet)
    this.histories = new Map(Object.entries(pruned))
    this.persist()
  }
}
