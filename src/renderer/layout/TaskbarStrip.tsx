import type { PaneState, FileBrowserPaneState, TerminalPaneState, BrowserPaneState, GitUiPaneState } from '../../shared/contracts'

const PANE_ICONS: Record<string, string> = {
  'file-browser': '🗂',
  'terminal': '🖥',
  'browser': '🌐',
  'notes': '📝',
  'radar': '📡',
  'gitui': '🧰',
  'api-toolkit': '🛠',
}

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
    <div className="collapsed-strip">
      {panes.map((pane) => {
        const isCollapsed = collapsedSet.has(pane.id)
        const isActive = activePaneId === pane.id && !isCollapsed

        let pillClass = 'collapsed-pill'
        if (isCollapsed) pillClass += ' is-ghosted'
        if (isActive) pillClass += ' is-active'

        const subtitle = paneSubtitle(pane)

        return (
          <div
            key={pane.id}
            className={pillClass}
            title={`${pane.title}${subtitle ? ' — ' + subtitle : ''}`}
            onClick={() => isCollapsed ? onRestore(pane.id) : onActivate(pane.id)}
          >
            <span className="collapsed-pill__icon">{PANE_ICONS[pane.type] ?? '▪'}</span>
            <span className="collapsed-pill__title">{subtitle || pane.title}</span>
            <button
              type="button"
              className="collapsed-pill__close"
              title="Close"
              onClick={(e) => { e.stopPropagation(); onClose(pane.id) }}
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}
