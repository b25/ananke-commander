import { useEffect } from 'react'
import type { AppStateSnapshot, WorkspaceState } from '../../shared/contracts'
import { bestLayout } from '../lib/layouts'
import { shouldShellHandleShortcut } from '../lib/keyboardShortcuts'
import { showToast } from '../components/useToast'

type Params = {
  snap: AppStateSnapshot | null
  ws: WorkspaceState | undefined
  setSnap: (next: AppStateSnapshot) => void
  closePane: (paneId: string) => void
  handleLayoutSelect: (layoutId: string) => void
  screenPanesCount: number
  onShowShortcuts?: () => void
}

/**
 * App-shell keyboard shortcuts, consolidated into a single `keydown` listener (previously four
 * separate effects each attaching their own listener):
 *  - Cmd/Ctrl + 1–9        switch workspace
 *  - Cmd/Ctrl + W          close active pane
 *  - Cmd/Ctrl + Shift + F  best-fit layout for the active screen
 *  - Ctrl + Tab / Shift    cycle the active pane
 */
export function useAppKeyboardShortcuts({
  snap,
  ws,
  setSnap,
  closePane,
  handleLayoutSelect,
  screenPanesCount,
  onShowShortcuts
}: Params): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!shouldShellHandleShortcut(e)) return
      const mod = e.ctrlKey || e.metaKey

      // ? (Shift+/): show keyboard shortcuts overlay
      if (e.key === '?' && !mod && onShowShortcuts) {
        e.preventDefault()
        onShowShortcuts()
        return
      }


      // Cmd/Ctrl + 1–9: switch workspace
      if (snap && mod) {
        const n = parseInt(e.key)
        if (n >= 1 && n <= 9) {
          const t = snap.workspaces[n - 1]
          if (t && t.id !== snap.activeWorkspaceId) {
            e.preventDefault()
            void window.ananke.state.setActiveWorkspace(t.id).then(setSnap)
            return
          }
        }
      }

      if (!ws) return

      // Cmd/Ctrl + W: close active pane — shows an Undo toast so the close is recoverable
      if (mod && e.key === 'w' && ws.activePaneId) {
        e.preventDefault()
        const closedPaneId = ws.activePaneId
        const wsId = ws.id
        void closePane(closedPaneId)
        showToast('Pane closed', 'info', {
          label: 'Undo',
          onClick: () => {
            void window.ananke.state.getRecentlyClosed().then((entries) => {
              const entry = entries.find((rc) => rc.snapshot.id === closedPaneId)
              if (entry) {
                void window.ananke.state.restoreClosed(wsId, entry.id).then(setSnap)
              }
            })
          }
        })
        return
      }

      // Cmd/Ctrl + Shift + F: best-fit layout
      if (mod && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        void handleLayoutSelect(bestLayout(screenPanesCount).id)
        return
      }

      // Ctrl + Tab (+ Shift): cycle active pane
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (ws.panes.length < 2) return
        const idx = ws.panes.findIndex((p) => p.id === ws.activePaneId)
        const next = e.shiftKey
          ? (idx - 1 + ws.panes.length) % ws.panes.length
          : (idx + 1) % ws.panes.length
        void window.ananke.state.setActivePane(ws.id, ws.panes[next].id).then(setSnap)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snap, ws, setSnap, closePane, handleLayoutSelect, screenPanesCount, onShowShortcuts])
}
