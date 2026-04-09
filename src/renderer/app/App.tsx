import { useCallback, useEffect, useState } from 'react'
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
import { PaneGrid } from '../layout/PaneGrid'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { FileBrowserPane } from '../panes/file-browser/FileBrowserPane'
import { TerminalPane } from '../panes/terminal/TerminalPane'
import { BrowserPlaceholderPane } from '../panes/browser/BrowserPlaceholderPane'
import { NotesPane } from '../panes/notes/NotesPane'
import { RadarPane } from '../panes/radar/RadarPane'
import { NotesSettings } from '../settings/NotesSettings'
import { PrivacySettings } from '../settings/PrivacySettings'

export function App() {
  const [snap, setSnap] = useState<AppStateSnapshot | null>(null)
  const [drawer, setDrawer] = useState<'none' | 'settings' | 'recent'>('none')

  const refresh = useCallback(async () => {
    setSnap(await window.ananke.state.get())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  let ws = snap?.workspaces.find((w) => w.id === snap.activeWorkspaceId)
  if (snap && !ws && snap.workspaces.length > 0) {
    ws = snap.workspaces[0]
    // Silently auto-correct state next tick
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

  const addPane = useCallback(
    async (type: PaneType) => {
      if (!ws) return
      const id = crypto.randomUUID()
      const home = await window.ananke.getPath('home')
      let p: PaneState
      if (type === 'file-browser') {
        p = {
          id,
          type: 'file-browser',
          title: 'Files',
          leftPath: home,
          rightPath: home,
          focusedSide: 'left',
          leftSelection: [],
          rightSelection: []
        } satisfies FileBrowserPaneState
      } else if (type === 'terminal') {
        p = { id, type: 'terminal', title: 'Terminal', cwd: home } satisfies TerminalPaneState
      } else if (type === 'browser') {
        p = {
          id,
          type: 'browser',
          title: 'Browser',
          url: 'about:blank'
        } satisfies BrowserPaneState
      } else if (type === 'radar') {
        p = {
          id,
          type: 'radar',
          title: 'Radar',
          rootPath: home,
          pathHistory: []
        } satisfies RadarPaneState
      } else {
        p = { id, type: 'notes', title: 'Notes', body: '' } satisfies NotesPaneState
      }
      const panes = [...ws.panes, p]
      setSnap(await window.ananke.state.replacePanes(ws.id, panes, id))
    },
    [ws]
  )

  const renderPane = (pane: PaneState) => {
    const isActive = ws!.activePaneId === pane.id
    const onTileClick = () => {
      if (!isActive) void setActivePane(pane.id)
    }
    if (pane.type === 'file-browser') {
      return (
        <div key={pane.id} onClick={onTileClick} role="presentation" className="pane-wrapper">
          <FileBrowserPane
            pane={pane}
            isActive={isActive}
            allPanes={ws!.panes}
            onUpdate={(next) => void updatePane(pane.id, next)}
            onClose={() => void closePane(pane.id)}
          />
        </div>
      )
    }
    if (pane.type === 'terminal') {
      return (
        <div key={pane.id} onClick={onTileClick} role="presentation" className="pane-wrapper">
          <TerminalPane
            pane={pane}
            isActive={isActive}
            scrollback={snap!.settings.privacy.terminalHistoryMax}
            onClose={() => void closePane(pane.id)}
          />
        </div>
      )
    }
    if (pane.type === 'browser') {
      return (
        <div key={pane.id} onClick={onTileClick} role="presentation" className="pane-wrapper">
          <BrowserPlaceholderPane
            pane={pane}
            isActive={isActive}
            onClose={() => void closePane(pane.id)}
            onUpdate={(next) => void updatePane(pane.id, next)}
          />
        </div>
      )
    }
    if (pane.type === 'radar') {
      return (
        <div key={pane.id} onClick={onTileClick} role="presentation" className="pane-wrapper">
          <RadarPane
            pane={pane}
            isActive={isActive}
            onUpdate={(next) => void updatePane(pane.id, next)}
            onClose={() => void closePane(pane.id)}
          />
        </div>
      )
    }
    return (
      <div key={pane.id} onClick={onTileClick} role="presentation" className="pane-wrapper">
        <NotesPane
          pane={pane}
          isActive={isActive}
          notesUndoMax={snap!.settings.privacy.notesUndoMax}
          onUpdate={(next) => void updatePane(pane.id, next)}
          onClose={() => void closePane(pane.id)}
        />
      </div>
    )
  }

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
        <PaneGrid>{ws.panes.map((p) => renderPane(p))}</PaneGrid>
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
