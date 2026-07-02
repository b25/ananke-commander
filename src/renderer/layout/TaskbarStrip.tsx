import type { PaneState, FileBrowserPaneState, TerminalPaneState, BrowserPaneState, GitUiPaneState } from '../../shared/contracts'
import { PaneIcon } from '../components/icons'
import type { PaneType } from '../../shared/contracts'

function paneSubtitle(pane: PaneState): string {
  if (pane.type === 'file-browser') {
    const fb = pane as FileBrowserPaneState
    const side = fb.focusedSide === 'left' ? fb.leftPath : fb.rightPath
    return side.split(/[/\\]/).pop() || side
  }
  if (pane.type === 'terminal') {
    const t = pane as TerminalPaneState
    return t.cwd.split(/[/\\]/).pop() || t.cwd
  }
  if (pane.type === 'browser') {
    const b = pane as BrowserPaneState
    if (!b.url || b.url === 'about:blank') return ''
    try { return new URL(b.url).hostname } catch { return '' }
  }
  if (pane.type === 'gitui') {
    const g = pane as GitUiPaneState
    return g.cwd.split(/[/\\]/).pop() || g.cwd
  }
  return ''
}

const KNOWN_PANE_TYPES = new Set<string>([
  'file-browser', 'terminal', 'browser', 'notes', 'radar', 'gitui', 'api-toolkit'
])

interface Props {
  panes: PaneState[]
  activePaneId: string | null
  collapsedIds: string[]
  onRestore: (paneId: string) => void
  onActivate: (paneId: string) => void
  onClose: (paneId: string) => void
}

export function TaskbarStrip({ panes, activePaneId, collapsedIds, onRestore, onActivate, onClose }: Props) {
  if (panes.length === 0) return null

  const collapsedSet = new Set(collapsedIds)

  return (
    <div className="collapsed-strip" role="toolbar" aria-label="Pane strip">
      {panes.map((pane) => {
        const isCollapsed = collapsedSet.has(pane.id)
        const isActive = activePaneId === pane.id && !isCollapsed

        let pillClass = 'collapsed-pill'
        if (isCollapsed) pillClass += ' is-ghosted'
        if (isActive) pillClass += ' is-active'

        const subtitle = paneSubtitle(pane)
        const actionLabel = isCollapsed ? 'Restore' : 'Activate'

        return (
          <div key={pane.id} className={pillClass} title={`${pane.title}${subtitle ? ' — ' + subtitle : ''}`}>
            <button
              type="button"
              className="collapsed-pill__main"
              aria-label={`${actionLabel} pane ${pane.title}`}
              onClick={() => (isCollapsed ? onRestore(pane.id) : onActivate(pane.id))}
            >
              <span className="collapsed-pill__icon" aria-hidden>
                {KNOWN_PANE_TYPES.has(pane.type)
                  ? <PaneIcon type={pane.type as PaneType} size={12} />
                  : <span>▪</span>}
              </span>
              <span className="collapsed-pill__title">{subtitle || pane.title}</span>
            </button>
            <button
              type="button"
              className="collapsed-pill__close"
              title="Close"
              aria-label={`Close ${pane.title} pane`}
              onClick={() => onClose(pane.id)}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
