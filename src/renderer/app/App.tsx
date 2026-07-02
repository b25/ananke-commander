import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStateSnapshot, PaneType } from '../../shared/contracts'
import { WorkspaceRail } from '../layout/WorkspaceRail'
import { CanvasWorkspace } from '../layout/CanvasWorkspace'
import { ScreenSelector } from '../layout/ScreenSelector'
import { LayoutPicker } from '../layout/LayoutPicker'
import { NewPanePicker } from '../layout/NewPanePicker'
import { AppMenuDropdown } from '../layout/AppMenuDropdown'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { SettingsDrawer } from '../layout/SettingsDrawer'
import { TomlEditorModal } from '../layout/TomlEditorModal'
import { DiagOverlay } from '../layout/DiagOverlay'
import { ConfirmModal } from '../components/ConfirmModal'
import { bestLayout } from '../lib/layouts'
import { useWorkspaceStability } from './useWorkspaceStability'
import { useWorkspaceActions } from './useWorkspaceActions'
import { useStateSync } from './useStateSync'
import { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts'
import { usePaneRenderer } from './usePaneRenderer'
import { buildDebugInfo } from '../lib/debugInfo'
import { applyFractions } from '../lib/paneGeometry'
import {
  offsetToScreenIndex,
  paneOnScreen,
  paneScreenIndex,
  screenIndexToColRow
} from '../lib/screenIndex'

export function App() {
  const [snap, setSnap] = useState<AppStateSnapshot | null>(null)
  const [drawer, setDrawer] = useState<'none' | 'settings' | 'recent'>('none')
  const [tomlEditorOpen, setTomlEditorOpen] = useState(false)
  const [diagOpen, setDiagOpen] = useState(false)

  const openTomlEditor = useCallback(async () => {
    await window.ananke.config.pauseWatch()
    setTomlEditorOpen(true)
  }, [])

  const closeTomlEditor = useCallback(async (newSnap?: AppStateSnapshot) => {
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
  const notifyAddError = useCallback((message: string) => {
    if (addErrorTimer.current) clearTimeout(addErrorTimer.current)
    setAddError(message)
    addErrorTimer.current = setTimeout(() => setAddError(null), 4000)
  }, [])

  // Global toast channel — `ananke:toast` events from any renderer component land here
  const [toastMsg, setToastMsg] = useState<{ message: string; tone: 'error' | 'warn' | 'info' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissToast = useCallback(() => {
    if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null }
    setToastMsg(null)
  }, [])
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, tone = 'error' } = (e as CustomEvent<{ message: string; tone?: string }>).detail
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToastMsg({ message, tone: tone as 'error' | 'warn' | 'info' })
      toastTimer.current = setTimeout(() => setToastMsg(null), 5000)
    }
    window.addEventListener('ananke:toast', handler)
    return () => window.removeEventListener('ananke:toast', handler)
  }, [])

  // Workspace delete confirm modal state
  const [wsConfirm, setWsConfirm] = useState<{ id: string; name: string; paneCount: number } | null>(null)
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
      void window.ananke.state.set({ settings: snap.settings }).catch((e) => console.error('[state] settings save failed', e))
    }
    prevDrawer.current = drawer
  }, [drawer, snap])

  const activeWorkspaceId = snap?.activeWorkspaceId ?? null
  let ws = snap?.workspaces.find((w) => w.id === activeWorkspaceId)
  if (snap && !ws && snap.workspaces.length > 0) ws = snap.workspaces[0]

  const vpW = viewportSize?.w ?? 0
  const vpH = viewportSize?.h ?? 0
  const displayWs = useMemo(
    () => ws ? { ...ws, panes: applyFractions(ws.panes, vpW, vpH) } : ws,
    [ws, vpW, vpH]
  )

  const activeScreen = ws ? offsetToScreenIndex(ws.canvasOffset, vpW, vpH) : 0
  const activeCollapsedIds = useMemo(() => new Set(ws?.screenCollapsed?.[activeScreen] ?? []), [ws, activeScreen])
  const { col: screenCol, row: screenRow } = screenIndexToColRow(activeScreen)
  const screenPanesCount = ws ? ws.panes.filter((p) => paneOnScreen(p, screenCol, screenRow)).length : 0
  const activeLayoutId = ws?.screenLayouts?.[activeScreen] ?? bestLayout(screenPanesCount).id

  const panesPerScreen = useMemo((): Record<number, number> => {
    if (!ws) return {}
    const counts: Record<number, number> = {}
    for (const p of ws.panes) {
      const idx = paneScreenIndex(p)
      counts[idx] = (counts[idx] ?? 0) + 1
    }
    return counts
  }, [ws])

  useWorkspaceStability({ snap, setSnap, ws, vpW, vpH })

  const runState = useStateSync(setSnap)

  const {
    setActivePane,
    updatePane,
    closePane,
    handleCanvasOffsetChange,
    handleLayoutSelect,
    addPane,
    applySmartLayouts,
    handleRestorePane,
    handleCloseCollapsed,
    repairWorkspace
  } = useWorkspaceActions({ ws, vpW, vpH, activeScreen, screenCol, screenRow, setSnap, notifyAddError })

  // Listen for create-pane events from other components (e.g. "New Terminal Here")
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type: PaneType; cwd?: string }>).detail
      void addPane(detail.type, { cwd: detail.cwd })
    }
    window.addEventListener('create-pane', handler)
    return () => window.removeEventListener('create-pane', handler)
  }, [addPane])

  const handleViewportResize = useCallback((w: number, h: number) => {
    setViewportSize({ w, h })
    if (resizeTimer.current) clearTimeout(resizeTimer.current)
    resizeTimer.current = setTimeout(() => { void applySmartLayouts(w, h) }, 150)
  }, [applySmartLayouts])

  const renderPane = usePaneRenderer({
    displayWs,
    snap,
    activeCollapsedIds,
    updatePane,
    closePane
  })

  useAppKeyboardShortcuts({ snap, ws, setSnap, closePane, handleLayoutSelect, screenPanesCount })

  const copyDebugInfo = useCallback(() => {
    if (!ws) return
    void navigator.clipboard.writeText(
      buildDebugInfo({ ws, vpW, vpH, activeScreen, screenCol, screenRow, activeLayoutId })
    )
  }, [ws, vpW, vpH, activeScreen, screenCol, screenRow, activeLayoutId])

  // Browser panes stay mounted even when collapsed so the WebContentsView is not destroyed.
  // All other pane types are unmounted when collapsed (saves memory/CPU).
  const displayWsForCanvas = displayWs ? { ...displayWs, panes: displayWs.panes.filter(p => !activeCollapsedIds.has(p.id) || p.type === 'browser') } : displayWs

  useEffect(() => {
    if (drawer === 'none') return
    // Hide native browser views so they don't overlay the drawer
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: false }))
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer('none')
    }
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('keydown', onEsc)
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [drawer])

  if (!snap || !ws || !displayWs || !displayWsForCanvas) return <div className="app-shell" style={{ padding: 16 }}>Loading…</div>

  return (
    <div className="app-shell">
      <WorkspaceRail workspaces={snap.workspaces} activeId={snap.activeWorkspaceId}
        onSelect={(id) => void runState(() => window.ananke.state.setActiveWorkspace(id))}
        onAdd={() => void runState(() => window.ananke.state.addWorkspace(`Workspace ${snap.workspaces.length + 1}`))}
        onClone={(id) => void runState(() => window.ananke.state.cloneWorkspace(id))}
        onRename={(id, name) => void runState(() => window.ananke.state.renameWorkspace(id, name))}
        onDelete={(id) => {
          const t = snap.workspaces.find(w => w.id === id)
          if (!t) return
          setWsConfirm({ id, name: t.name, paneCount: t.panes.length })
        }} />
      <div className="main-stage">
        {tomlError && (
          <div className="app-error-banner" role="alert">
            ⚠ workspace.toml error: {tomlError}
            <button type="button" aria-label="Dismiss workspace error" onClick={dismissTomlError}>✕</button>
          </div>
        )}
        {addError && (
          <div className="app-error-banner app-error-banner--warn" role="alert">
            ⚠ {addError}
            <button type="button" aria-label="Dismiss warning" onClick={dismissAddError}>✕</button>
          </div>
        )}
        {toastMsg && (
          <div
            className={`app-error-banner${toastMsg.tone === 'warn' ? ' app-error-banner--warn' : toastMsg.tone === 'info' ? ' app-error-banner--info' : ''}`}
            role="alert"
          >
            {toastMsg.tone === 'error' ? '⛔' : toastMsg.tone === 'info' ? 'ℹ' : '⚠'} {toastMsg.message}
            <button type="button" aria-label="Dismiss notification" onClick={dismissToast}>✕</button>
          </div>
        )}
        <div className="toolbar toolbar-thin">
          <span className="muted" style={{ marginRight: 6, fontSize: '11px', whiteSpace: 'nowrap' }}>{ws.name}</span>
          <ScreenSelector canvasOffset={ws.canvasOffset} viewportW={vpW} viewportH={vpH} screenLayouts={ws.screenLayouts ?? {}} panesPerScreen={panesPerScreen} onSelect={(x, y) => void handleCanvasOffsetChange(x, y)} />
          <div style={{ width: 6 }} />
          <LayoutPicker activeLayoutId={activeLayoutId} screenPanesCount={screenPanesCount} onSelect={(l) => void handleLayoutSelect(l.id)} />
          <div style={{ width: 6, borderRight: '1px solid var(--border)', marginRight: 6 }} />

          <NewPanePicker onSelect={(type) => void addPane(type)} />

          <div style={{ flex: 1 }} />

          <AppMenuDropdown
            diagOpen={diagOpen}
            drawer={drawer}
            onToggleDiag={() => setDiagOpen(o => !o)}
            onToggleRecent={() => setDrawer(drawer === 'recent' ? 'none' : 'recent')}
            onToggleSettings={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}
          />
        </div>
        <CanvasWorkspace workspace={displayWsForCanvas} renderPane={renderPane} onActivate={setActivePane}
          onCanvasOffsetChange={handleCanvasOffsetChange}
          onViewportResize={handleViewportResize}
          allPanes={displayWs.panes}
          collapsedIds={Array.from(activeCollapsedIds)}
          onRestorePane={(id) => void handleRestorePane(id)}
          onCloseCollapsed={(id) => void handleCloseCollapsed(id)} />
        {diagOpen && (
          <DiagOverlay
            ws={ws}
            vpW={vpW} vpH={vpH}
            activeScreen={activeScreen}
            screenCol={screenCol}
            screenRow={screenRow}
            activeLayoutId={activeLayoutId}
            onClose={() => setDiagOpen(false)}
          />
        )}
      </div>
      {drawer === 'settings' && (
        <SettingsDrawer
          snap={snap}
          setSnap={setSnap}
          onClose={() => setDrawer('none')}
          onEditToml={() => void openTomlEditor()}
          onCopyDebugInfo={copyDebugInfo}
          onRepairWorkspace={() => void repairWorkspace()}
        />
      )}
      {drawer === 'recent' && (
        <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="recent-drawer-title">
          <h3 id="recent-drawer-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0, padding: 'var(--space-inset)', borderBottom: '1px solid var(--border)' }}>
            Recent Panes
            <button type="button" aria-label="Close recent panes" onClick={() => setDrawer('none')} style={{ background: 'transparent', border: 'none', fontSize: '16px', padding: 0 }}>✕</button>
          </h3>
          <RecentlyClosedPanel snap={snap} ws={ws} onClose={() => setDrawer('none')} onSnapshot={setSnap} />
        </aside>
      )}
      {tomlEditorOpen && <TomlEditorModal onClose={(s) => void closeTomlEditor(s)} />}
      {wsConfirm && (
        <ConfirmModal
          title="Delete Workspace"
          message={`Delete "${wsConfirm.name}"? ${wsConfirm.paneCount} pane(s) will be lost. This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          tone="destructive"
          requireTyped={wsConfirm.name}
          onConfirm={() => {
            const id = wsConfirm.id
            setWsConfirm(null)
            void runState(() => window.ananke.state.deleteWorkspace(id))
          }}
          onCancel={() => setWsConfirm(null)}
        />
      )}
    </div>
  )
}
