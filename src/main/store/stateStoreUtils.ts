import type { WorkspaceState } from '../../shared/contracts.js'

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
