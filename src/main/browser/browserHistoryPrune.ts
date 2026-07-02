import type { HistoryEntry } from './browserHistoryService.js'

/**
 * Pure helper: filters a histories record to keep only buckets whose key
 * (paneId) exists in `liveIds`. Returns a new record; does not mutate input.
 *
 * Used by BrowserHistoryService.pruneOrphans at startup to drop buckets for
 * panes that were closed in a previous session and never cleaned up (e.g. due
 * to a crash or a destroy() that raced shutdown).
 */
export function pruneHistories(
  histories: Record<string, HistoryEntry[]>,
  liveIds: Set<string>
): Record<string, HistoryEntry[]> {
  const result: Record<string, HistoryEntry[]> = {}
  for (const [paneId, entries] of Object.entries(histories)) {
    if (liveIds.has(paneId)) result[paneId] = entries
  }
  return result
}
