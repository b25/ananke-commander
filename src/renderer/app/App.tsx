import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppStateSnapshot, BrowserPaneState, FileBrowserPaneState, NotesPaneState, PaneState, PaneType, RadarPaneState, TerminalPaneState } from '../../shared/contracts'
import { WorkspaceRail } from '../layout/WorkspaceRail'
import { CanvasWorkspace } from '../layout/CanvasWorkspace'
import { ScreenSelector } from '../layout/ScreenSelector'
import { LayoutPicker } from '../layout/LayoutPicker'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { FileBrowserPane } from '../panes/file-browser/FileBrowserPane'
import { TerminalPane } from '../panes/terminal/TerminalPane'
import { BrowserPlaceholderPane } from '../panes/browser/BrowserPlaceholderPane'
import { NotesPane } from '../panes/notes/NotesPane'
import { RadarPane } from '../panes/radar/RadarPane'
import { NotesSettings } from '../settings/NotesSettings'
import { PrivacySettings } from '../settings/PrivacySettings'
import { LAYOUTS, applyLayout, bestLayout } from '../lib/layouts'

const MIN_W = 300
const MIN_H = 200

function applyFractions(panes: PaneState[], vpW: number, vpH: number): PaneState[] {
  return panes.map((p) => ({ ...p, x: p.xPct * vpW, y: p.yPct * vpH, width: Math.max(MIN_W, p.wPct * vpW), height: Math.max(MIN_H, p.hPct * vpH) }))
}

function screenIndex(canvasOffset: { x: number; y: number }, vpW: number, vpH: number): number {
  const col = Math.round(canvasOffset.x / (vpW || 1))
  const row = Math.round(canvasOffset.y / (vpH || 1))
  return row * 2 + col
}

export function App() {
  const [snap, setSnap] = useState<AppStateSnapshot | null>(null)
  const [drawer, setDrawer] = useState<'none' | 'settings' | 'recent'>('none')
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth - 56, h: window.innerHeight - 32 })
  const [tomlError, setTomlError] = useState<string | null>(null)
  const refresh = useCallback(async () => { setSnap(await window.ananke.state.get()) }, [])
  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const unsubState = window.ananke.config.onStateChanged((newSnap) => { setSnap(newSnap) })
    const unsubErr = window.ananke.config.onTomlError((msg) => {
      setTomlError(msg)
      setTimeout(() => setTomlError(null), 7000)
    })
    return () => { unsubState(); unsubErr() }
  }, [])

  let ws = snap?.workspaces.find((w) => w.id === snap.activeWorkspaceId)
  if (snap && !ws && snap.workspaces.length > 0) { ws = snap.workspaces[0]; void window.ananke.state.setActiveWorkspace(ws.id) }

  const vpW = viewportSize.w
  const vpH = viewportSize.h
  const displayWs = useMemo(
    () => ws ? { ...ws, panes: applyFractions(ws.panes, vpW, vpH) } : ws,
    [ws, vpW, vpH]
  )

  const activeScreen = ws ? screenIndex(ws.canvasOffset, vpW, vpH) : 0
  const screenCol = activeScreen % 2
  const screenRow = Math.floor(activeScreen / 2)
  const screenPanesCount = ws ? ws.panes.filter(p => Math.floor(p.xPct) === screenCol && Math.floor(p.yPct) === screenRow).length : 0
  const activeLayoutId = ws?.screenLayouts?.[activeScreen] ?? bestLayout(screenPanesCount).id

  const panesPerScreen = useMemo((): Record<number, number> => {
    if (!ws) return {}
    const counts: Record<number, number> = {}
    for (const p of ws.panes) {
      const col = Math.floor(p.xPct)
      const row = Math.floor(p.yPct)
      const idx = row * 2 + col
      counts[idx] = (counts[idx] ?? 0) + 1
    }
    return counts
  }, [ws])

  const setActivePane = useCallback(async (id: string) => {
    if (!ws) return; setSnap(await window.ananke.state.setActivePane(ws.id, id))
  }, [ws])

  const updatePane = useCallback(async (paneId: string, next: PaneState) => {
    if (!ws) return; setSnap(await window.ananke.state.updatePane(ws.id, paneId, next))
  }, [ws])

  const closePane = useCallback(async (paneId: string) => {
    if (!ws) return; setSnap(await window.ananke.state.closePane(ws.id, paneId))
  }, [ws])

  const handleCanvasOffsetChange = useCallback(async (x: number, y: number) => {
    if (!ws) return
    const sx = Math.max(0, Math.min(vpW, Math.round(x / (vpW || 1)) * vpW))
    const sy = Math.max(0, Math.min(vpH, Math.round(y / (vpH || 1)) * vpH))
    setSnap(await window.ananke.state.setCanvasOffset(ws.id, sx, sy))
  }, [ws, vpW, vpH])

  const handleLayoutSelect = useCallback(async (layoutId: string) => {
    if (!ws) return
    const layout = LAYOUTS.find(l => l.id === layoutId)
    if (!layout) return
    const arranged = applyLayout(ws.panes, layout, screenCol, screenRow, vpW, vpH)
    await window.ananke.state.setScreenLayout(ws.id, activeScreen, layoutId)
    setSnap(await window.ananke.state.replacePanes(ws.id, arranged, ws.activePaneId))
  }, [ws, screenCol, screenRow, vpW, vpH, activeScreen])

  const addPane = useCallback(async (type: PaneType) => {
    if (!ws) return
    const id = crypto.randomUUID()
    const home = await window.ananke.getPath('home')
    const wPct = 0.5, hPct = 0.5
    const w = Math.round(wPct * vpW), h = Math.round(hPct * vpH)
    const px = screenCol * vpW, py = screenRow * vpH
    const base = { id, x: px, y: py, width: w, height: h, xPct: px / vpW, yPct: py / vpH, wPct, hPct }
    let p: PaneState
    if (type === 'file-browser') p = { ...base, type: 'file-browser', title: 'Files', leftPath: home, rightPath: home, focusedSide: 'left', leftSelection: [], rightSelection: [] } satisfies FileBrowserPaneState
    else if (type === 'terminal') p = { ...base, type: 'terminal', title: 'Terminal', cwd: home } satisfies TerminalPaneState
    else if (type === 'browser') p = { ...base, type: 'browser', title: 'Browser', url: 'about:blank' } satisfies BrowserPaneState
    else if (type === 'radar') p = { ...base, type: 'radar', title: 'Radar', rootPath: home, pathHistory: [] } satisfies RadarPaneState
    else p = { ...base, type: 'notes', title: 'Notes', body: '' } satisfies NotesPaneState
    const newPanes = [...ws.panes, p]
    const newCount = newPanes.filter(q => Math.floor(q.xPct) === screenCol && Math.floor(q.yPct) === screenRow).length
    const layoutId = ws.screenLayouts?.[activeScreen] ?? bestLayout(newCount).id
    const layout = LAYOUTS.find(l => l.id === layoutId) ?? bestLayout(newCount)
    const arranged = applyLayout(newPanes, layout, screenCol, screenRow, vpW, vpH)
    await window.ananke.state.setScreenLayout(ws.id, activeScreen, layout.id)
    setSnap(await window.ananke.state.replacePanes(ws.id, arranged, id))
  }, [ws, vpW, vpH, screenCol, screenRow, activeScreen])

  const renderPane = (pane: PaneState) => {
    const isActive = displayWs!.activePaneId === pane.id
    if (pane.type === 'file-browser') return <FileBrowserPane pane={pane} isActive={isActive} allPanes={displayWs!.panes} onUpdate={(next) => void updatePane(pane.id, next)} onClose={() => void closePane(pane.id)} />
    if (pane.type === 'terminal') return <TerminalPane pane={pane} isActive={isActive} scrollback={snap!.settings.privacy.terminalHistoryMax} onClose={() => void closePane(pane.id)} />
    if (pane.type === 'browser') return <BrowserPlaceholderPane pane={pane} isActive={isActive} canvasOffset={displayWs!.canvasOffset} onClose={() => void closePane(pane.id)} onUpdate={(next) => void updatePane(pane.id, next)} />
    if (pane.type === 'radar') return <RadarPane pane={pane} isActive={isActive} onUpdate={(next) => void updatePane(pane.id, next)} onClose={() => void closePane(pane.id)} />
    return <NotesPane pane={pane} isActive={isActive} notesUndoMax={snap!.settings.privacy.notesUndoMax} onUpdate={(next) => void updatePane(pane.id, next)} onClose={() => void closePane(pane.id)} />
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!snap || !(e.ctrlKey || e.metaKey)) return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 9) { const t = snap.workspaces[n - 1]; if (t && t.id !== snap.activeWorkspaceId) { e.preventDefault(); void window.ananke.state.setActiveWorkspace(t.id).then(setSnap) } }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [snap])

  useEffect(() => {
    if (!ws) return
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'w' && ws.activePaneId) { e.preventDefault(); void closePane(ws.activePaneId) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [ws, closePane])

  useEffect(() => {
    if (!ws) return
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        void handleLayoutSelect(bestLayout(screenPanesCount).id)
      }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [ws, handleLayoutSelect, screenPanesCount])

  useEffect(() => {
    if (!ws) return
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return; e.preventDefault()
      if (ws.panes.length < 2) return
      const idx = ws.panes.findIndex(p => p.id === ws.activePaneId)
      const next = e.shiftKey ? (idx - 1 + ws.panes.length) % ws.panes.length : (idx + 1) % ws.panes.length
      void window.ananke.state.setActivePane(ws.id, ws.panes[next].id).then(setSnap)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [ws, snap])

  if (!snap || !ws || !displayWs) return <div className="app-shell" style={{ padding: 16 }}>Loading…</div>

  return (
    <div className="app-shell">
      <WorkspaceRail workspaces={snap.workspaces} activeId={snap.activeWorkspaceId}
        onSelect={(id) => void window.ananke.state.setActiveWorkspace(id).then(setSnap)}
        onAdd={() => void window.ananke.state.addWorkspace(`Workspace ${snap.workspaces.length + 1}`).then(setSnap)}
        onClone={(id) => void window.ananke.state.cloneWorkspace(id).then(setSnap)}
        onRename={(id, name) => void window.ananke.state.renameWorkspace(id, name).then(setSnap)}
        onDelete={(id) => {
          const t = snap.workspaces.find(w => w.id === id)
          if (!t || !confirm(`Delete "${t.name}"? ${t.panes.length} pane(s) will be lost.`)) return
          void window.ananke.state.deleteWorkspace(id).then(setSnap)
        }} />
      <div className="main-stage">
        {tomlError && (
          <div className="toml-error-banner">
            ⚠ workspace.toml error: {tomlError}
            <button type="button" onClick={() => setTomlError(null)}>✕</button>
          </div>
        )}
        <div className="toolbar toolbar-thin">
          <span className="muted" style={{ marginRight: 6, fontSize: '11px', whiteSpace: 'nowrap' }}>{ws.name}</span>
          <ScreenSelector canvasOffset={ws.canvasOffset} viewportW={vpW} viewportH={vpH} screenLayouts={ws.screenLayouts ?? {}} panesPerScreen={panesPerScreen} onSelect={(x, y) => void handleCanvasOffsetChange(x, y)} />
          <div style={{ width: 6 }} />
          <LayoutPicker activeLayoutId={activeLayoutId} screenPanesCount={screenPanesCount} onSelect={(l) => void handleLayoutSelect(l.id)} />
          <div style={{ width: 6, borderRight: '1px solid var(--border)', marginRight: 6 }} />
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '8px', marginRight: '4px' }}>
            <button type="button" className="btn-thin" onClick={() => void addPane('file-browser')}>🗂 Files</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('terminal')}>🖥 Terminal</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('browser')}>🌐 Browser</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('notes')}>📝 Notes</button>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '8px', marginRight: '4px' }}>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F3' }))}>F3 Read</button>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F4' }))}>F4 Edit</button>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F5' }))}>F5 Copy</button>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F6' }))}>F6 Move</button>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F8' }))}>F8 Delete</button>
            <button type="button" className="btn-thin" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'Arc' }))}>Archive</button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" className="btn-thin" onClick={() => setDrawer(drawer === 'recent' ? 'none' : 'recent')}>Recent</button>
            <button type="button" className="btn-thin" onClick={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}>Settings</button>
          </div>
        </div>
        <CanvasWorkspace workspace={displayWs} renderPane={renderPane} onActivate={setActivePane}
          onCanvasOffsetChange={handleCanvasOffsetChange}
          onViewportResize={(w, h) => setViewportSize({ w, h })} />
      </div>
      {drawer === 'settings' && (
        <aside className="drawer"><h3>Settings</h3><div className="body">
          <NotesSettings value={snap.settings.obsidian} onChange={(obsidian) => setSnap({ ...snap, settings: { ...snap.settings, obsidian } })} />
          <PrivacySettings value={snap.settings.privacy} onChange={(privacy) => setSnap({ ...snap, settings: { ...snap.settings, privacy } })} onPurgeRecentlyClosed={() => void window.ananke.state.purgeRecentlyClosed().then(setSnap)} />
          <button type="button" className="primary" onClick={() => void window.ananke.state.set({ settings: snap.settings }).then(setSnap)}>Save settings</button>
          <button type="button" style={{ marginLeft: 8 }} onClick={() => setDrawer('none')}>Close</button>
          <hr style={{ margin: '12px 0', borderColor: 'var(--border)' }} />
          <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>Workspace File (TOML)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => void window.ananke.config.openToml()}>Open in Editor</button>
            <button type="button" onClick={() => void window.ananke.config.writeToml()}>Force Save</button>
          </div>
        </div></aside>
      )}
      {drawer === 'recent' && (
        <aside className="drawer"><RecentlyClosedPanel snap={snap} ws={ws} onClose={() => setDrawer('none')} onSnapshot={setSnap} /></aside>
      )}
    </div>
  )
}
