import type { AppStateSnapshot, WorkspaceState } from '../../shared/contracts.js'

/**
 * Returns true when the workspace already has `paneId` as its active pane,
 * meaning setActiveWorkspacePane would be a no-op (no store write needed).
 */
export function activePaneUnchanged(
  workspaces: WorkspaceState[],
  workspaceId: string,
  paneId: string | null
): boolean {
  const ws = workspaces.find((w) => w.id === workspaceId)
  return ws !== undefined && ws.activePaneId === paneId
}

/**
 * Returns a copy of the snapshot with `recentlyClosed` cleared (empty array).
 * Used by high-frequency mutation IPC handlers (pane clicks, canvas offsets, layout changes)
 * to avoid cloning up-to-50 full pane entries — including notes bodies — over IPC on every
 * interaction. The renderer preserves its local recentlyClosed from startup / dedicated fetches.
 * (PERF-5 / Task 19)
 */
export function toLeanSnapshot(snap: AppStateSnapshot): AppStateSnapshot {
  return { ...snap, recentlyClosed: [] }
}
