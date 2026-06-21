import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import type { PaneState, PaneType, WorkspaceState } from '../../shared/contracts.js'

const FALLBACK_VP_W = 1440
const FALLBACK_VP_H = 900

const DEFAULT_PANE_SIZES: Record<PaneType, { w: number; h: number }> = {
  'file-browser': { w: 720, h: 450 },
  'terminal':     { w: 720, h: 450 },
  'browser':      { w: 720, h: 450 },
  'notes':        { w: 720, h: 450 },
  'radar':        { w: 720, h: 450 },
  'gitui':        { w: 720, h: 450 },
  'api-toolkit':  { w: 720, h: 450 }
}

/** Fill in absolute + fractional geometry for panes loaded from older state that lack it. */
export function injectPaneGeometry(panes: PaneState[]): PaneState[] {
  return panes.map((pane, idx) => {
    const base = typeof pane.x === 'number' ? pane : (() => {
      const { w, h } = DEFAULT_PANE_SIZES[pane.type]
      const s = idx * 30
      return { ...pane, x: 40 + s, y: 40 + s, width: w, height: h }
    })()
    if (typeof base.xPct === 'number') return base
    return { ...base, xPct: base.x / FALLBACK_VP_W, yPct: base.y / FALLBACK_VP_H, wPct: base.width / FALLBACK_VP_W, hPct: base.height / FALLBACK_VP_H }
  })
}

/** Backfill optional workspace fields and pane geometry for state loaded from disk/TOML. */
export function migrateWorkspaces(workspaces: WorkspaceState[]): WorkspaceState[] {
  return workspaces.map((ws) => ({
    ...ws,
    canvasOffset: ws.canvasOffset ?? { x: 0, y: 0 },
    screenLayouts: ws.screenLayouts ?? {},
    intentLayouts: ws.intentLayouts ?? {},
    screenCollapsed: ws.screenCollapsed ?? {},
    panes: injectPaneGeometry(ws.panes)
  }))
}

function isValidDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

/** Replace file-browser pane paths that no longer point at a directory with the home dir. */
export function sanitizePaths(workspaces: WorkspaceState[]): WorkspaceState[] {
  const home = homedir()
  return workspaces.map((ws) => ({
    ...ws,
    panes: ws.panes.map((pane) => {
      if (pane.type !== 'file-browser') return pane
      return { ...pane, leftPath: isValidDir(pane.leftPath) ? pane.leftPath : home, rightPath: isValidDir(pane.rightPath) ? pane.rightPath : home }
    })
  }))
}

/**
 * One-shot normalization applied when workspaces ENTER the store (startup, TOML import).
 * Doing this at the write boundary means `getSnapshot()` can be a cheap read instead of
 * re-running `statSync` on every file-browser path on every IPC call.
 */
export function normalizeWorkspaces(workspaces: WorkspaceState[]): WorkspaceState[] {
  return migrateWorkspaces(sanitizePaths(workspaces))
}
