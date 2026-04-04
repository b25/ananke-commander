import type { KeyboardEvent } from 'react'
import type { ListDirEntry } from '../../../shared/contracts'
import { parentDir } from '../../lib/pathUtils'

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  path: string
  entries: ListDirEntry[]
  selected: Set<string>
  focused: boolean
  onPathChange: (p: string) => void
  onSelect: (paths: string[], additive: boolean) => void
  onActivate: (entry: ListDirEntry) => void
}

export function FileList({
  path,
  entries,
  selected,
  focused,
  onPathChange,
  onSelect,
  onActivate
}: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return
    if (selected.size !== 1) return
    const only = [...selected][0]
    const entry = entries.find((x) => x.path === only)
    if (!entry) return
    e.preventDefault()
    onActivate(entry)
  }

  return (
    <div
      className={`file-list-wrap ${focused ? 'focused' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="path-bar" title={path}>
        {path}
      </div>
      <div className="file-rows">
        {(() => {
          const norm = path.replace(/[/\\]+$/, '') || path
          const atRoot = norm === '/' || /^[A-Za-z]:$/.test(norm)
          if (atRoot) return null
          return (
            <div
              className="file-row"
              onDoubleClick={() => onPathChange(parentDir(path))}
            >
              <span className="name">..</span>
            </div>
          )
        })()}
        {entries.map((e) => (
          <div
            key={e.path}
            className={`file-row ${selected.has(e.path) ? 'selected' : ''}`}
            onClick={(ev) => onSelect([e.path], ev.metaKey || ev.ctrlKey)}
            onDoubleClick={() => onActivate(e)}
          >
            <span className="name">{e.isDirectory ? '📁 ' : ''}{e.name}</span>
            <span className="muted">{e.isDirectory ? '' : formatSize(e.size)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
