import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStateSnapshot, BrowserPaneState, FileBrowserPaneState, NotesPaneState, PaneState, PaneType, RadarPaneState, TerminalPaneState } from '../../shared/contracts'
import { WorkspaceRail } from '../layout/WorkspaceRail'
import { CanvasWorkspace } from '../layout/CanvasWorkspace'
import { ScreenSelector } from '../layout/ScreenSelector'
import { LayoutPicker } from '../layout/LayoutPicker'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { TomlEditorModal } from '../layout/TomlEditorModal'
import { FileBrowserPane } from '../panes/file-browser/FileBrowserPane'
import { TerminalPane } from '../panes/terminal/TerminalPane'
import { BrowserPlaceholderPane } from '../panes/browser/BrowserPlaceholderPane'
import { NotesPane } from '../panes/notes/NotesPane'
import { RadarPane } from '../panes/radar/RadarPane'
import { NotesSettings } from '../settings/NotesSettings'
import { PrivacySettings } from '../settings/PrivacySettings'
import { LAYOUTS, LAYOUT_SLOTS, applyLayout, bestLayout, nextProgressionLayout, fittingLayout } from '../lib/layouts'

const MIN_W = 300
const MIN_H = 200
const MAX_WINDOWS_PER_WORKSPACE = 24

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
  const [tomlEditorOpen, setTomlEditorOpen] = useState(false)

  const openTomlEditor = useCallback(async () => {
    await window.ananke.config.pauseWatch()
    setTomlEditorOpen(true)
  }, [])

  const closeTomlEditor = useCallback(async (newSnap?: import('../../shared/contracts').AppStateSnapshot) => {
    setTomlEditorOpen(false)
    await window.ananke.config.resumeWatch()
    if (newSnap) setSnap(newSnap)
  }, [])
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth - 56, h: window.innerHeight - 56 })
  const [tomlError, setTomlError] = useState<string | null>(null)
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tomlErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTomlError = useCallback(() => {
    if (tomlErrorTimer.current) { clearTimeout(tomlErrorTimer.current); tomlErrorTimer.current = null }
    setTomlError(null)
  }, [])
  const [addError, setAddError] = useState<string | null>(null)
  const addErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissAddError = useCallback(() => {
    if (addErrorTimer.current) { clearTimeout(addErrorTimer.current); addErrorTimer.current = null }
    setAddError(null)
  }, [])
  const refresh = useCallback(async () => { setSnap(await window.ananke.state.get()) }, [])
  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const unsubState = window.ananke.config.onStateChanged((newSnap) => { setSnap(newSnap) })
    const unsubErr = window.ananke.config.onTomlError((msg) => {
      if (tomlErrorTimer.current) clearTimeout(tomlErrorTimer.current)
      setTomlError(msg)
      tomlErrorTimer.current = setTimeout(() => setTomlError(null), 7000)
    })
    return () => { unsubState(); unsubErr() }
  }, [])

  // Auto-save settings when closing the settings drawer
  const prevDrawer = useRef(drawer)
  useEffect(() => {
    if (prevDrawer.current === 'settings' && drawer !== 'settings' && snap) {
      void window.ananke.state.set({ settings: snap.settings })
    }
    prevDrawer.current = drawer
  }, [drawer, snap])

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

    const currentCollapsedIds = ws.screenCollapsed?.[activeScreen] ?? []
    const currentCollapsedSet = new Set(currentCollapsedIds)
    const visibleOnScreen = ws.panes.filter(
      p => Math.floor(p.xPct) === screenCol && Math.floor(p.yPct) === screenRow && !currentCollapsedSet.has(p.id)
    )
    const newSlots = layout.slots.length
    let newCollapsedIds: string[]

    if (newSlots >= visibleOnScreen.length + currentCollapsedIds.length) {
      newCollapsedIds = []
    } else if (newSlots >= visibleOnScreen.length) {
      const canRestore = newSlots - visibleOnScreen.length
      newCollapsedIds = currentCollapsedIds.slice(canRestore)
    } else {
      const excess = visibleOnScreen.slice(newSlots).map(p => p.id)
      newCollapsedIds = [...currentCollapsedIds, ...excess]
    }

    const newCollapsedSet = new Set(newCollapsedIds)
    const panesForLayout = ws.panes.filter(p => !newCollapsedSet.has(p.id))
    const arranged = applyLayout(panesForLayout, layout, screenCol, screenRow, vpW, vpH)
    const collapsedPanes = ws.panes.filter(p => newCollapsedSet.has(p.id))
    const finalPanes = [...arranged, ...collapsedPanes]

    await window.ananke.state.setIntentLayout(ws.id, activeScreen, layoutId)
    await window.ananke.state.setScreenLayout(ws.id, activeScreen, layoutId)
    await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsedIds)
    setSnap(await window.ananke.state.replacePanes(ws.id, finalPanes, ws.activePaneId))
  }, [ws, screenCol, screenRow, vpW, vpH, activeScreen])

  const addPane = useCallback(async (type: PaneType) => {
    if (!ws) return

    // Hard cap across all screens
    if (ws.panes.length >= MAX_WINDOWS_PER_WORKSPACE) {
      if (addErrorTimer.current) clearTimeout(addErrorTimer.current)
      setAddError('Maximum 24 windows per workspace reached')
      addErrorTimer.current = setTimeout(() => setAddError(null), 4000)
      return
    }

    const panesOnScrn = (idx: number): number => {
      const col = idx % 2, row = Math.floor(idx / 2)
      return ws.panes.filter(p => Math.floor(p.xPct) === col && Math.floor(p.yPct) === row).length
    }
    const slotsOnScrn = (idx: number): number => LAYOUT_SLOTS[ws.screenLayouts?.[idx] ?? ''] ?? 1

    // Determine target screen and layout
    let tIdx = activeScreen
    let tCol = screenCol
    let tRow = screenRow
    let tLayoutId = ws.screenLayouts?.[tIdx] ?? 'full'

    if (panesOnScrn(tIdx) >= (LAYOUT_SLOTS[tLayoutId] ?? 1)) {
      const nextLId = nextProgressionLayout(tLayoutId)
      if (nextLId) {
        // Advance layout on current screen
        tLayoutId = nextLId
      } else {
        // Try spill to another screen
        const spillIdx = ([0, 1, 2, 3] as const).find(i => i !== tIdx && panesOnScrn(i) < slotsOnScrn(i))
        if (spillIdx !== undefined) {
          tIdx = spillIdx
          tCol = spillIdx % 2
          tRow = Math.floor(spillIdx / 2)
          tLayoutId = ws.screenLayouts?.[tIdx] ?? 'full'
          await window.ananke.state.setCanvasOffset(ws.id, tCol * vpW, tRow * vpH)
        } else {
          if (addErrorTimer.current) clearTimeout(addErrorTimer.current)
          setAddError('Maximum 24 windows per workspace reached')
          addErrorTimer.current = setTimeout(() => setAddError(null), 4000)
          return
        }
      }
    }

    const id = crypto.randomUUID()
    const home = await window.ananke.getPath('home')
    const wPct = 0.5, hPct = 0.5
    const w = Math.round(wPct * vpW), h = Math.round(hPct * vpH)
    const base = { id, x: tCol * vpW, y: tRow * vpH, width: w, height: h, xPct: tCol, yPct: tRow, wPct, hPct }
    let p: PaneState
    if (type === 'file-browser') p = { ...base, type: 'file-browser', title: 'Files', leftPath: home, rightPath: home, focusedSide: 'left', leftSelection: [], rightSelection: [] } satisfies FileBrowserPaneState
    else if (type === 'terminal') p = { ...base, type: 'terminal', title: 'Terminal', cwd: home } satisfies TerminalPaneState
    else if (type === 'browser') p = { ...base, type: 'browser', title: 'Browser', url: 'about:blank' } satisfies BrowserPaneState
    else if (type === 'radar') p = { ...base, type: 'radar', title: 'Radar', rootPath: home, pathHistory: [] } satisfies RadarPaneState
    else p = { ...base, type: 'notes', title: 'Notes', body: '' } satisfies NotesPaneState

    const newPanes = [...ws.panes, p]
    const layout = LAYOUTS.find(l => l.id === tLayoutId) ?? bestLayout(newPanes.filter(q => Math.floor(q.xPct) === tCol && Math.floor(q.yPct) === tRow).length)
    const arranged = applyLayout(newPanes, layout, tCol, tRow, vpW, vpH)
    await window.ananke.state.setScreenLayout(ws.id, tIdx, layout.id)
    setSnap(await window.ananke.state.replacePanes(ws.id, arranged, id))
  }, [ws, vpW, vpH, screenCol, screenRow, activeScreen])

  const applySmartLayouts = useCallback(async (newVpW: number, newVpH: number) => {
    if (!ws) return
    let newPanes = ws.panes
    const layoutChanges: Record<number, string> = {}

    for (const screenIdx of [0, 1, 2, 3] as const) {
      const col = screenIdx % 2
      const row = Math.floor(screenIdx / 2)
      const hasPanes = newPanes.some(p => Math.floor(p.xPct) === col && Math.floor(p.yPct) === row)
      if (!hasPanes) continue
      const intent  = ws.intentLayouts?.[screenIdx] ?? ws.screenLayouts?.[screenIdx] ?? 'full'
      const current = ws.screenLayouts?.[screenIdx] ?? 'full'
      const target  = fittingLayout(intent, newVpW, newVpH)
      if (target !== current) {
        const layout = LAYOUTS.find(l => l.id === target)!
        newPanes = applyLayout(newPanes, layout, col, row, newVpW, newVpH)
        layoutChanges[screenIdx] = target
      }
    }

    if (Object.keys(layoutChanges).length === 0) return
    for (const [idx, layoutId] of Object.entries(layoutChanges)) {
      await window.ananke.state.setScreenLayout(ws.id, Number(idx), layoutId)
    }
    setSnap(await window.ananke.state.replacePanes(ws.id, newPanes, ws.activePaneId))
  }, [ws])

  const handleViewportResize = useCallback((w: number, h: number) => {
    setViewportSize({ w, h })
    if (resizeTimer.current) clearTimeout(resizeTimer.current)
    resizeTimer.current = setTimeout(() => { void applySmartLayouts(w, h) }, 150)
  }, [applySmartLayouts])

  const handleRestorePane = useCallback(async (collapsedPaneId: string) => {
    if (!ws) return
    const currentCollapsedIds = ws.screenCollapsed?.[activeScreen] ?? []
    const visibleOnScreen = ws.panes.filter(
      p => Math.floor(p.xPct) === screenCol && Math.floor(p.yPct) === screenRow && !currentCollapsedIds.includes(p.id)
    )
    const target = visibleOnScreen.find(p => p.id === ws.activePaneId) ?? visibleOnScreen[0]
    const newCollapsed = currentCollapsedIds.filter(id => id !== collapsedPaneId)

    if (!target) {
      await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsed)
      setSnap(await window.ananke.state.replacePanes(ws.id, ws.panes, ws.activePaneId))
      return
    }

    const newPanes = ws.panes.map(p => {
      if (p.id !== collapsedPaneId) return p
      return { ...p, xPct: target.xPct, yPct: target.yPct, wPct: target.wPct, hPct: target.hPct, x: target.x, y: target.y, width: target.width, height: target.height }
    })
    await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, [...newCollapsed.filter(id => id !== target.id), target.id])
    setSnap(await window.ananke.state.replacePanes(ws.id, newPanes, collapsedPaneId))
  }, [ws, screenCol, screenRow, activeScreen])

  const handleCloseCollapsed = useCallback(async (collapsedPaneId: string) => {
    if (!ws) return
    const newCollapsed = (ws.screenCollapsed?.[activeScreen] ?? []).filter(id => id !== collapsedPaneId)
    await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsed)
    setSnap(await window.ananke.state.closePane(ws.id, collapsedPaneId))
  }, [ws, activeScreen])

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

  const activeCollapsedIds = new Set(ws?.screenCollapsed?.[activeScreen] ?? [])
  const collapsedPanes = displayWs ? displayWs.panes.filter(p => activeCollapsedIds.has(p.id)) : []
  const displayWsForCanvas = displayWs ? { ...displayWs, panes: displayWs.panes.filter(p => !activeCollapsedIds.has(p.id)) } : displayWs

  if (!snap || !ws || !displayWs || !displayWsForCanvas) return <div className="app-shell" style={{ padding: 16 }}>Loading…</div>

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
          <div className="app-error-banner">
            ⚠ workspace.toml error: {tomlError}
            <button type="button" onClick={dismissTomlError}>✕</button>
          </div>
        )}
        {addError && (
          <div className="app-error-banner app-error-banner--warn">
            ⚠ {addError}
            <button type="button" onClick={dismissAddError}>✕</button>
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
        <CanvasWorkspace workspace={displayWsForCanvas} renderPane={renderPane} onActivate={setActivePane}
          onCanvasOffsetChange={handleCanvasOffsetChange}
          onViewportResize={handleViewportResize}
          collapsedPanes={collapsedPanes}
          onRestorePane={(id) => void handleRestorePane(id)}
          onCloseCollapsed={(id) => void handleCloseCollapsed(id)} />
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
            <button type="button" className="primary" onClick={() => void openTomlEditor()}>Edit TOML</button>
            <button type="button" onClick={() => void window.ananke.config.openToml()}>Open in System Editor</button>
            <button type="button" onClick={() => void window.ananke.config.writeToml()}>Force Save</button>
          </div>
        </div></aside>
      )}
      {drawer === 'recent' && (
        <aside className="drawer"><RecentlyClosedPanel snap={snap} ws={ws} onClose={() => setDrawer('none')} onSnapshot={setSnap} /></aside>
      )}
      {tomlEditorOpen && <TomlEditorModal onClose={(s) => void closeTomlEditor(s)} />}
    </div>
  )
}
