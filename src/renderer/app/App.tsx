import { useCallback, useEffect, useState } from 'react'
import type {
  AppStateSnapshot,
  BrowserPaneState,
  FileBrowserPaneState,
  NotesPaneState,
  PaneState,
  PaneType,
  TerminalPaneState
} from '../../shared/contracts'
import { WorkspaceRail } from '../layout/WorkspaceRail'
import { PaneGrid } from '../layout/PaneGrid'
import { RecentlyClosedPanel } from '../layout/RecentlyClosedPanel'
import { FileBrowserPane } from '../panes/file-browser/FileBrowserPane'
import { TerminalPane } from '../panes/terminal/TerminalPane'
import { BrowserPlaceholderPane } from '../panes/browser/BrowserPlaceholderPane'
import { NotesPane } from '../panes/notes/NotesPane'
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

  const ws = snap?.workspaces.find((w) => w.id === snap.activeWorkspaceId)

  const setActivePane = useCallback(
    async (id: string | null) => {
      if (!ws) return
      const panes = ws.panes
      setSnap(await window.ananke.state.replacePanes(ws.id, panes, id))
    },
    [ws]
  )

  const updatePane = useCallback(
    async (paneId: string, next: PaneState) => {
      if (!ws) return
      const panes = ws.panes.map((p) => (p.id === paneId ? next : p))
      setSnap(await window.ananke.state.replacePanes(ws.id, panes, ws.activePaneId))
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
          url: 'https://example.com/'
        } satisfies BrowserPaneState
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
    const onTileClick = () => void setActivePane(pane.id)
    if (pane.type === 'file-browser') {
      return (
        <div key={pane.id} onClick={onTileClick} role="presentation">
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
        <div key={pane.id} onClick={onTileClick} role="presentation">
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
        <div key={pane.id} onClick={onTileClick} role="presentation">
          <BrowserPlaceholderPane
            pane={pane}
            isActive={isActive}
            onClose={() => void closePane(pane.id)}
            onUpdate={(next) => void updatePane(pane.id, next)}
          />
        </div>
      )
    }
    return (
      <div key={pane.id} onClick={onTileClick} role="presentation">
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
        <div className="toolbar">
          <span className="muted">{ws.name}</span>
          <select
            aria-label="Add pane"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as PaneType | ''
              e.target.value = ''
              if (v) void addPane(v)
            }}
          >
            <option value="">+ Pane</option>
            <option value="file-browser">File browser</option>
            <option value="terminal">Terminal</option>
            <option value="browser">Browser</option>
            <option value="notes">Notes</option>
          </select>
          <button type="button" onClick={() => setDrawer(drawer === 'recent' ? 'none' : 'recent')}>
            Recent
          </button>
          <button type="button" onClick={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}>
            Settings
          </button>
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
