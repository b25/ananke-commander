import { app } from 'electron'
import { existsSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse, stringify } from 'smol-toml'
import type { AppStateSnapshot, FileBrowserPaneState, BrowserPaneState, NotesPaneState, PaneState, RadarPaneState, TerminalPaneState, WorkspaceState } from '../shared/contracts.js'

// ── TOML serialization ────────────────────────────────────────────────────────

function paneToToml(p: PaneState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: p.id,
    type: p.type,
    title: p.title,
    xPct: p.xPct,
    yPct: p.yPct,
    wPct: p.wPct,
    hPct: p.hPct,
  }
  if (p.type === 'file-browser') {
    const fb = p as FileBrowserPaneState
    base.left_path = fb.leftPath.replace(/\\/g, '/')
    base.right_path = fb.rightPath.replace(/\\/g, '/')
    base.focused_side = fb.focusedSide
  } else if (p.type === 'terminal') {
    base.cwd = (p as TerminalPaneState).cwd.replace(/\\/g, '/')
  } else if (p.type === 'browser') {
    base.url = (p as BrowserPaneState).url
  } else if (p.type === 'notes') {
    base.body = (p as NotesPaneState).body
  } else if (p.type === 'radar') {
    const r = p as RadarPaneState
    base.root_path = r.rootPath.replace(/\\/g, '/')
    base.path_history = r.pathHistory.map(s => s.replace(/\\/g, '/'))
  }
  return base
}

function workspaceToToml(ws: WorkspaceState): Record<string, unknown> {
  const screenLayouts: Record<string, string> = {}
  for (const [k, v] of Object.entries(ws.screenLayouts ?? {})) {
    screenLayouts[String(k)] = v
  }
  return {
    id: ws.id,
    name: ws.name,
    active_pane: ws.activePaneId ?? '',
    canvas_offset: [ws.canvasOffset.x, ws.canvasOffset.y],
    screen_layouts: screenLayouts,
    panes: ws.panes.map(paneToToml),
  }
}

export function snapshotToToml(snap: AppStateSnapshot): string {
  const obj = {
    active_workspace: snap.activeWorkspaceId,
    workspaces: snap.workspaces.map(workspaceToToml),
  }
  const header = '# Ananke Commander — Workspace Configuration\n' +
    '# Edit this file while the app is running — changes are hot-reloaded.\n' +
    '# Pane types: file-browser, terminal, browser, notes, radar\n' +
    '# Layout IDs: full, halves, 1h-2v, 4-quad, 1h-3v\n' +
    '# Screens: 0=top-left  1=top-right  2=bottom-left  3=bottom-right\n\n'
  return header + stringify(obj)
}

// ── TOML deserialization ──────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}

function parsePaneFromToml(raw: unknown, idx: number): PaneState {
  if (!isRecord(raw)) throw new Error(`pane[${idx}] is not a table`)
  const type = str(raw.type)
  const id = str(raw.id) || randomUUID()
  const base = {
    id,
    title: str(raw.title, type),
    xPct: num(raw.xPct),
    yPct: num(raw.yPct),
    wPct: num(raw.wPct, 0.5),
    hPct: num(raw.hPct, 0.5),
    // Absolute values will be recalculated in renderer; set sensible defaults
    x: 0, y: 0, width: 720, height: 450,
  }
  const home = homedir()
  if (type === 'file-browser') {
    return { ...base, type: 'file-browser',
      leftPath: str(raw.left_path, home),
      rightPath: str(raw.right_path, home),
      focusedSide: str(raw.focused_side, 'left') as 'left' | 'right',
      leftSelection: [], rightSelection: [],
    } satisfies FileBrowserPaneState
  }
  if (type === 'terminal') {
    return { ...base, type: 'terminal', cwd: str(raw.cwd, home) } satisfies TerminalPaneState
  }
  if (type === 'browser') {
    return { ...base, type: 'browser', url: str(raw.url, 'about:blank') } satisfies BrowserPaneState
  }
  if (type === 'notes') {
    return { ...base, type: 'notes', body: str(raw.body) } satisfies NotesPaneState
  }
  if (type === 'radar') {
    return { ...base, type: 'radar',
      rootPath: str(raw.root_path, home),
      pathHistory: Array.isArray(raw.path_history) ? raw.path_history.map(s => str(s)) : [],
    } satisfies RadarPaneState
  }
  throw new Error(`Unknown pane type: "${type}"`)
}

function parseWorkspaceFromToml(raw: unknown, idx: number): WorkspaceState {
  if (!isRecord(raw)) throw new Error(`workspace[${idx}] is not a table`)
  const id = str(raw.id) || randomUUID()
  const panes = Array.isArray(raw.panes)
    ? raw.panes.map((p, i) => parsePaneFromToml(p, i))
    : []

  // Deduplicate pane IDs
  const seenIds = new Set<string>()
  const dedupedPanes = panes.map(p => {
    if (seenIds.has(p.id)) return { ...p, id: randomUUID() }
    seenIds.add(p.id)
    return p
  })

  const screenLayouts: Record<number, string> = {}
  const rawLayouts = raw.screen_layouts
  if (isRecord(rawLayouts)) {
    for (const [k, v] of Object.entries(rawLayouts)) {
      const n = parseInt(k)
      if (!isNaN(n) && typeof v === 'string') screenLayouts[n] = v
    }
  }

  const offset = Array.isArray(raw.canvas_offset) ? raw.canvas_offset : [0, 0]
  const activePane = str(raw.active_pane, '')
  const validActivePane = dedupedPanes.find(p => p.id === activePane)?.id ?? dedupedPanes[0]?.id ?? null

  return {
    id,
    name: str(raw.name, `Workspace ${idx + 1}`),
    panes: dedupedPanes,
    activePaneId: validActivePane,
    canvasOffset: { x: Math.max(0, num(offset[0])), y: Math.max(0, num(offset[1])) },
    screenLayouts,
  }
}

export function tomlToSnapshot(raw: string): Pick<AppStateSnapshot, 'workspaces' | 'activeWorkspaceId'> {
  const obj = parse(raw)
  if (!isRecord(obj)) throw new Error('TOML root must be a table')
  const workspaces = Array.isArray(obj.workspaces)
    ? obj.workspaces.map((w, i) => parseWorkspaceFromToml(w, i))
    : []
  if (workspaces.length === 0) throw new Error('TOML must contain at least one workspace')

  // Deduplicate workspace IDs
  const seenWsIds = new Set<string>()
  const dedupedWorkspaces = workspaces.map(ws => {
    if (seenWsIds.has(ws.id)) return { ...ws, id: randomUUID() }
    seenWsIds.add(ws.id)
    return ws
  })

  const activeWorkspaceId = str(obj.active_workspace, '')
  const validActiveWs = dedupedWorkspaces.find(w => w.id === activeWorkspaceId)?.id
    ?? dedupedWorkspaces[0].id

  return { workspaces: dedupedWorkspaces, activeWorkspaceId: validActiveWs }
}

// ── TomlConfigService ─────────────────────────────────────────────────────────

export class TomlConfigService {
  private filePath: string
  private watcher: ReturnType<typeof watch> | null = null
  private selfWriting = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private onExternalChange: (raw: string) => void

  constructor(onExternalChange: (raw: string) => void) {
    this.filePath = join(app.getPath('userData'), 'workspace.toml')
    this.onExternalChange = onExternalChange
  }

  getPath(): string { return this.filePath }

  readRaw(): string | null {
    try { return readFileSync(this.filePath, 'utf8') } catch { return null }
  }

  write(snap: AppStateSnapshot): void {
    this.selfWriting = true
    const tmp = this.filePath + '.tmp'
    try {
      writeFileSync(tmp, snapshotToToml(snap), 'utf8')
      renameSync(tmp, this.filePath)
    } finally {
      // Reset after a tick — fs.watch callbacks are async
      setImmediate(() => { this.selfWriting = false })
    }
  }

  startWatching(): void {
    if (!existsSync(this.filePath)) return
    try {
      this.watcher = watch(this.filePath, () => {
        if (this.selfWriting) return
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          const raw = this.readRaw()
          if (raw !== null) this.onExternalChange(raw)
        }, 200)
      })
      this.watcher.on('error', () => this.stopWatching())
    } catch { /* file may not exist yet */ }
  }

  stopWatching(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    this.watcher?.close()
    this.watcher = null
  }
}
