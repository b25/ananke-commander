import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppStateSnapshot,
  BrowserPaneState,
  FileBrowserPaneState,
  NotesPaneState,
  PaneState,
  PaneType,
  RadarPaneState,
  TerminalPaneState
} from '../../shared/contracts'
import { WorkspaceRail } from '../layout/WorkspaceRail'
import { CanvasWorkspace } from '../layout/CanvasWorkspace'
import { RadarMinimap } from '../layout/RadarMinimap'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { FileBrowserPane } from '../panes/file-browser/FileBrowserPane'
import { TerminalPane } from '../panes/terminal/TerminalPane'
import { BrowserPlaceholderPane } from '../panes/browser/BrowserPlaceholderPane'
import { NotesPane } from '../panes/notes/NotesPane'
import { RadarPane } from '../panes/radar/RadarPane'
import { NotesSettings } from '../settings/NotesSettings'
import { PrivacySettings } from '../settings/PrivacySettings'
import { findFreeSlot, resolveOverlaps } from '../lib/tileUtils'

const DEFAULT_PANE_SIZES: Record<PaneType, { w: number; h: number }> = {
  'file-browser': { w: 900, h: 600 },
  'terminal': { w: 700, h: 420 },
  'browser': { w: 1024, h: 700 },
  'notes': { w: 600, h: 500 },
  'radar': { w: 700, h: 500 }
}

export function App() {
  const [snap, setSnap] = useState<AppStateSnapshot | null>(null)
  const [drawer, setDrawer] = useState<'none' | 'settings' | 'recent'>('none')
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth - 56, h: window.innerHeight - 32 })
  const refresh = useCallback(async () => {
    setSnap(await window.ananke.state.get())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  let ws = snap?.workspaces.find((w) => w.id === snap.activeWorkspaceId)
  if (snap && !ws && snap.workspaces.length > 0) {
    ws = snap.workspaces[0]
    void window.ananke.state.setActiveWorkspace(ws.id)
  }

  const setActivePane = useCallback(
    async (id: string) => {
      if (!ws) return
      setSnap(await window.ananke.state.setActivePane(ws.id, id))
    },
    [ws]
  )

  const updatePane = useCallback(
    async (paneId: string, next: PaneState) => {
      if (!ws) return
      setSnap(await window.ananke.state.updatePane(ws.id, paneId, next))
    },
    [ws]
  )

  const closePane = useCallback(
    async (paneId: string) => {
      if (!ws) return
      setSnap(await window.ananke.state.closePane(ws.id, paneId))
    },
    [ws]
  )

  const handleGeometryChange = useCallback(
    async (paneId: string, x: number, y: number, w: number, h: number) => {
      if (!ws) return
      // Apply the geometry update then resolve any overlaps caused by the move/resize
      const updated = ws.panes.map((p) =>
        p.id === paneId ? { ...p, x, y, width: w, height: h } : p
      )
      const resolved = resolveOverlaps(updated, paneId)
      setSnap(await window.ananke.state.replacePanes(ws.id, resolved, ws.activePaneId))
    },
    [ws]
  )

  const handleCanvasOffsetChange = useCallback(
    async (x: number, y: number) => {
      if (!ws) return
      setSnap(await window.ananke.state.setCanvasOffset(ws.id, x, y))
    },
    [ws]
  )

  const addPane = useCallback(
    async (type: PaneType) => {
      if (!ws) return
      const id = crypto.randomUUID()
      const home = await window.ananke.getPath('home')
      const { w, h } = DEFAULT_PANE_SIZES[type]
      // Bias slot search to the current viewport so the new pane appears on-screen
      const viewportPanes = ws.panes.map((p) => ({
        ...p,
        x: p.x - ws.canvasOffset.x,
        y: p.y - ws.canvasOffset.y
      }))
      const rawSlot = findFreeSlot(viewportPanes, w, h)
      const { x: px, y: py } = {
        x: Math.max(0, rawSlot.x + ws.canvasOffset.x),
        y: Math.max(0, rawSlot.y + ws.canvasOffset.y)
      }
      let p: PaneState
      if (type === 'file-browser') {
        p = {
          id, type: 'file-browser', title: 'Files',
          x: px, y: py, width: w, height: h,
          leftPath: home, rightPath: home,
          focusedSide: 'left', leftSelection: [], rightSelection: []
        } satisfies FileBrowserPaneState
      } else if (type === 'terminal') {
        p = { id, type: 'terminal', title: 'Terminal', x: px, y: py, width: w, height: h, cwd: home } satisfies TerminalPaneState
      } else if (type === 'browser') {
        p = { id, type: 'browser', title: 'Browser', x: px, y: py, width: w, height: h, url: 'about:blank' } satisfies BrowserPaneState
      } else if (type === 'radar') {
        p = { id, type: 'radar', title: 'Radar', x: px, y: py, width: w, height: h, rootPath: home, pathHistory: [] } satisfies RadarPaneState
      } else {
        p = { id, type: 'notes', title: 'Notes', x: px, y: py, width: w, height: h, body: '' } satisfies NotesPaneState
      }
      const panes = [...ws.panes, p]
      setSnap(await window.ananke.state.replacePanes(ws.id, panes, id))
    },
    [ws]
  )

  const renderPane = (pane: PaneState, isDragging = false) => {
    const isActive = ws!.activePaneId === pane.id
    if (pane.type === 'file-browser') {
      return (
        <FileBrowserPane
          pane={pane}
          isActive={isActive}
          allPanes={ws!.panes}
          onUpdate={(next) => void updatePane(pane.id, next)}
          onClose={() => void closePane(pane.id)}
        />
      )
    }
    if (pane.type === 'terminal') {
      return (
        <TerminalPane
          pane={pane}
          isActive={isActive}
          scrollback={snap!.settings.privacy.terminalHistoryMax}
          onClose={() => void closePane(pane.id)}
        />
      )
    }
    if (pane.type === 'browser') {
      return (
        <BrowserPlaceholderPane
          pane={pane}
          isActive={isActive}
          isDragging={isDragging}
          canvasOffset={ws!.canvasOffset}
          onClose={() => void closePane(pane.id)}
          onUpdate={(next) => void updatePane(pane.id, next)}
        />
      )
    }
    if (pane.type === 'radar') {
      return (
        <RadarPane
          pane={pane}
          isActive={isActive}
          onUpdate={(next) => void updatePane(pane.id, next)}
          onClose={() => void closePane(pane.id)}
        />
      )
    }
    return (
      <NotesPane
        pane={pane}
        isActive={isActive}
        notesUndoMax={snap!.settings.privacy.notesUndoMax}
        onUpdate={(next) => void updatePane(pane.id, next)}
        onClose={() => void closePane(pane.id)}
      />
    )
  }

  // WS-UI-03: Ctrl+1–9 workspace switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!snap || !(e.ctrlKey || e.metaKey)) return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 9) {
        const target = snap.workspaces[n - 1]
        if (target && target.id !== snap.activeWorkspaceId) {
          e.preventDefault()
          void window.ananke.state.setActiveWorkspace(target.id).then(setSnap)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snap])

  // Ctrl+W — close active pane
  useEffect(() => {
    if (!ws) return
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'w') return
      if (!ws.activePaneId) return
      e.preventDefault()
      void closePane(ws.activePaneId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ws, closePane])

  // WS-UI-05: Ctrl+Tab pane focus cycling
  useEffect(() => {
    if (!ws) return
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return
      e.preventDefault()
      const panes = ws.panes
      if (panes.length < 2) return
      const currentIdx = panes.findIndex(p => p.id === ws.activePaneId)
      const nextIdx = e.shiftKey
        ? (currentIdx - 1 + panes.length) % panes.length
        : (currentIdx + 1) % panes.length
      void window.ananke.state.setActivePane(ws.id, panes[nextIdx].id).then(setSnap)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ws, snap])

  if (!snap || !ws) {
    return <div className="app-shell" style={{ padding: 16 }}>Loading…</div>
  }

  return (
    <div className="app-shell">
      <WorkspaceRail
        workspaces={snap.workspaces}
        activeId={snap.activeWorkspaceId}
        onSelect={(id) => void window.ananke.state.setActiveWorkspace(id).then(setSnap)}
        onAdd={() => {
          const n = snap.workspaces.length + 1
          void window.ananke.state.addWorkspace(`Workspace ${n}`).then(setSnap)
        }}
        onClone={(id) => void window.ananke.state.cloneWorkspace(id).then(setSnap)}
        onRename={(id, name) => void window.ananke.state.renameWorkspace(id, name).then(setSnap)}
        onDelete={(id) => {
          const target = snap.workspaces.find(w => w.id === id)
          if (!target) return
          if (!confirm(`Delete "${target.name}"? ${target.panes.length} pane(s) will be lost.`)) return
          void window.ananke.state.deleteWorkspace(id).then(setSnap)
        }}
      />
      <div className="main-stage">
        <div className="toolbar toolbar-thin">
          <span className="muted" style={{ marginRight: 8, fontSize: '11px', whiteSpace: 'nowrap' }}>{ws.name}</span>
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '8px', marginRight: '4px' }}>
            <button type="button" className="btn-thin" onClick={() => void addPane('file-browser')}>🗂 Files</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('terminal')}>🖥 Terminal</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('browser')}>🌐 Browser</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('notes')}>📝 Notes</button>
            <button type="button" className="btn-thin" onClick={() => void addPane('radar')}>📡 Radar</button>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '8px', marginRight: '4px' }}>
            <button type="button" className="btn-thin" title="Read F3" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F3' }))}>F3 Read</button>
            <button type="button" className="btn-thin" title="Edit F4" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F4' }))}>F4 Edit</button>
            <button type="button" className="btn-thin" title="Copy F5" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F5' }))}>F5 Copy</button>
            <button type="button" className="btn-thin" title="Move F6" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F6' }))}>F6 Move</button>
            <button type="button" className="btn-thin" title="Delete F8" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'F8' }))}>F8 Delete</button>
            <button type="button" className="btn-thin" title="Archive" onClick={() => window.dispatchEvent(new CustomEvent('global-action', { detail: 'Arc' }))}>Archive</button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" className="btn-thin" onClick={() => setDrawer(drawer === 'recent' ? 'none' : 'recent')}>
              Recent
            </button>
            <button type="button" className="btn-thin" onClick={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}>
              Settings
            </button>
          </div>
        </div>

        <CanvasWorkspace
          workspace={ws}
          renderPane={renderPane}
          onActivate={setActivePane}
          onGeometryChange={handleGeometryChange}
          onCanvasOffsetChange={handleCanvasOffsetChange}
          onViewportResize={(w, h) => setViewportSize({ w, h })}
        />

        <RadarMinimap
          workspace={ws}
          viewportWidth={viewportSize.w}
          viewportHeight={viewportSize.h}
          onPan={handleCanvasOffsetChange}
        />
      </div>

      {drawer === 'settings' && (
        <aside className="drawer">
          <h3>Settings</h3>
          <div className="body">
            <NotesSettings
              value={snap.settings.obsidian}
              onChange={(obsidian) => setSnap({ ...snap, settings: { ...snap.settings, obsidian } })}
            />
            <PrivacySettings
              value={snap.settings.privacy}
              onChange={(privacy) => setSnap({ ...snap, settings: { ...snap.settings, privacy } })}
              onPurgeRecentlyClosed={() =>
                void window.ananke.state.purgeRecentlyClosed().then(setSnap)
              }
            />
            <button
              type="button"
              className="primary"
              onClick={() => void window.ananke.state.set({ settings: snap.settings }).then(setSnap)}
            >
              Save settings
            </button>
            <button type="button" style={{ marginLeft: 8 }} onClick={() => setDrawer('none')}>
              Close
            </button>
          </div>
        </aside>
      )}

      {drawer === 'recent' && (
        <aside className="drawer">
          <RecentlyClosedPanel
            snap={snap}
            ws={ws}
            onClose={() => setDrawer('none')}
            onSnapshot={setSnap}
          />
        </aside>
      )}
    </div>
  )
}
