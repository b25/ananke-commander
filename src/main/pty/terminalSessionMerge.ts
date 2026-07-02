/**
 * Pure helper for merging session-meta lists — no Electron or fs dependencies,
 * so it can be unit-tested with node:test directly.
 *
 * Task 28 / CORR-16: extracted from TerminalSessionStore to allow testing
 * the batch-merge logic without mocking Electron's app.getPath / electron-store.
 */
import type { TerminalSessionMeta } from '../../shared/contracts.js'

/**
 * Merge incoming (newest) session metas in front of existing ones, cap the
 * combined list at maxSessions, and return the trimmed-off entries as toDelete
 * (callers are responsible for deleting their .txt files).
 */
export function mergeSessionEntries(
  existing: TerminalSessionMeta[],
  incoming: TerminalSessionMeta[],
  maxSessions: number
): { kept: TerminalSessionMeta[]; toDelete: TerminalSessionMeta[] } {
  const merged = [...incoming, ...existing]
  const kept = merged.slice(0, maxSessions)
  const toDelete = merged.slice(maxSessions)
  return { kept, toDelete }
}
