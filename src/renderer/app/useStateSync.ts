import { useCallback } from 'react'
import type { AppStateSnapshot } from '../../shared/contracts'

export type StateSyncRunner = (
  producer: () => Promise<AppStateSnapshot | void>
) => Promise<void>

/**
 * Centralizes the "run a state mutation → apply the returned snapshot" pattern used across the
 * shell. `run(producer)` awaits the producer (which performs one or more `window.ananke.state.*`
 * calls and resolves to the resulting snapshot, or `void` to skip), applies it via `setSnap`, and
 * funnels every failure to a single `console.error` — so callers no longer scatter
 * `setSnap(await …)` with no `.catch` (which previously surfaced as unhandled rejections).
 */
export function useStateSync(setSnap: (next: AppStateSnapshot) => void): StateSyncRunner {
  return useCallback(
    async (producer: () => Promise<AppStateSnapshot | void>) => {
      try {
        const next = await producer()
        if (next) setSnap(next)
      } catch (e) {
        console.error('[state] update failed', e)
      }
    },
    [setSnap]
  )
}
