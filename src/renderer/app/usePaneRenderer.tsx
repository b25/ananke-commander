import { Suspense, lazy, useCallback } from 'react'
import type { AppStateSnapshot, PaneState, WorkspaceState } from '../../shared/contracts'
import { PaneHeader } from '../layout/PaneHeader'

const FileBrowserPane = lazy(() =>
  import('../panes/file-browser/FileBrowserPane').then((m) => ({ default: m.FileBrowserPane }))
)
const GitUiPane = lazy(() => import('../panes/gitui/GitUiPane').then((m) => ({ default: m.GitUiPane })))
const ApiToolkitPane = lazy(() =>
  import('../panes/api-toolkit/ApiToolkitPane').then((m) => ({ default: m.ApiToolkitPane }))
)
const TerminalPane = lazy(() => import('../panes/terminal/TerminalPane').then((m) => ({ default: m.TerminalPane })))
const BrowserPlaceholderPane = lazy(() =>
  import('../panes/browser/BrowserPlaceholderPane').then((m) => ({ default: m.BrowserPlaceholderPane }))
)
const NotesPane = lazy(() => import('../panes/notes/NotesPane').then((m) => ({ default: m.NotesPane })))
const RadarPane = lazy(() => import('../panes/radar/RadarPane').then((m) => ({ default: m.RadarPane })))

export interface UsePaneRendererArgs {
  displayWs: WorkspaceState | null | undefined
  snap: AppStateSnapshot | null | undefined
  activeCollapsedIds: Set<string>
  updatePane: (paneId: string, next: PaneState) => void
  closePane: (paneId: string) => void
}

export function usePaneRenderer({
  displayWs,
  snap,
  activeCollapsedIds,
  updatePane,
  closePane
}: UsePaneRendererArgs) {
  return useCallback(
    (pane: PaneState) => {
      if (!displayWs || !snap) return null
      const isActive = displayWs.activePaneId === pane.id
      if (pane.type === 'file-browser') {
        return (
          <Suspense fallback={<PaneHeader title="Files" paneType="file-browser" onClose={() => void closePane(pane.id)} />}>
            <FileBrowserPane
              pane={pane}
              isActive={isActive}
              allPanes={displayWs.panes}
              onUpdate={(next) => void updatePane(pane.id, next)}
              onClose={() => void closePane(pane.id)}
            />
          </Suspense>
        )
      }
      if (pane.type === 'terminal') {
        return (
          <Suspense fallback={<PaneHeader title="Terminal" paneType="terminal" onClose={() => void closePane(pane.id)} />}>
            <TerminalPane
              pane={pane}
              isActive={isActive}
              scrollback={snap.settings.terminal?.scrollback ?? 10_000}
              fontSize={snap.settings.terminal?.fontSize ?? 10}
              fontFamily={snap.settings.terminal?.fontFamily ?? 'ui-monospace, monospace'}
              onUpdate={(next) => void updatePane(pane.id, next)}
              onClose={() => void closePane(pane.id)}
            />
          </Suspense>
        )
      }
      if (pane.type === 'browser') {
        return (
          <Suspense fallback={<PaneHeader title="Browser" paneType="browser" onClose={() => void closePane(pane.id)} />}>
            <BrowserPlaceholderPane
              pane={pane}
              isActive={isActive}
              isCollapsed={activeCollapsedIds.has(pane.id)}
              canvasOffset={displayWs.canvasOffset}
              onClose={() => void closePane(pane.id)}
              onUpdate={(next) => void updatePane(pane.id, next)}
            />
          </Suspense>
        )
      }
      if (pane.type === 'radar') {
        return (
          <Suspense fallback={<PaneHeader title="Radar" paneType="radar" onClose={() => void closePane(pane.id)} />}>
            <RadarPane
              pane={pane}
              isActive={isActive}
              onUpdate={(next) => void updatePane(pane.id, next)}
              onClose={() => void closePane(pane.id)}
            />
          </Suspense>
        )
      }
      if (pane.type === 'gitui') {
        return (
          <Suspense fallback={<PaneHeader title="GitUI" paneType="gitui" onClose={() => void closePane(pane.id)} />}>
            <GitUiPane
              pane={pane}
              isActive={isActive}
              fontSize={snap.settings.terminal?.fontSize ?? 10}
              fontFamily={snap.settings.terminal?.fontFamily ?? 'ui-monospace, monospace'}
              onClose={() => void closePane(pane.id)}
            />
          </Suspense>
        )
      }
      if (pane.type === 'api-toolkit') {
        return (
          <Suspense fallback={<PaneHeader title="API Toolkit" paneType="api-toolkit" onClose={() => void closePane(pane.id)} />}>
            <ApiToolkitPane pane={pane} isActive={isActive} onClose={() => void closePane(pane.id)} />
          </Suspense>
        )
      }
      if (pane.type === 'notes') {
        return (
          <Suspense fallback={<PaneHeader title="Notes" paneType="notes" onClose={() => void closePane(pane.id)} />}>
            <NotesPane
              pane={pane}
              isActive={isActive}
              notesUndoMax={snap.settings.privacy.notesUndoMax}
              onUpdate={(next) => void updatePane(pane.id, next)}
              onClose={() => void closePane(pane.id)}
            />
          </Suspense>
        )
      }
      const orphan = pane as PaneState
      return (
        <div className="pane pane--placeholder">
          <PaneHeader title={`Unknown pane: ${String(orphan.type)}`} onClose={() => void closePane(orphan.id)} />
        </div>
      )
    },
    [displayWs, snap, activeCollapsedIds, updatePane, closePane]
  )
}
