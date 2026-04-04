import { useState, type KeyboardEvent, useRef, useEffect } from 'react'
import type { ListDirEntry } from '../../../shared/contracts'
import { parentDir } from '../../lib/pathUtils'

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

type Props = {
  path: string
  entries: ListDirEntry[]
  selected: Set<string>
  focused: boolean
  onPathChange: (p: string) => void
  onSelect: (paths: string[], additive: boolean) => void
  onActivate: (entry: ListDirEntry) => void
  isActive: boolean
}

export function FileList({
  path,
  entries,
  selected,
  focused,
  onPathChange,
  onSelect,
  onActivate,
  isActive
}: Props) {
  const [folderSizes, setFolderSizes] = useState<Record<string, number>>({})
  const [calculating, setCalculating] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Clear calculated sizes when path changes
    setFolderSizes({})
    setCalculating(new Set())
  }, [path])

  const norm = path.replace(/[/\\]+$/, '') || path
  const atRoot = norm === '/' || /^[A-Za-z]:$/.test(norm)
  
  const displayEntries = atRoot
    ? entries
    : [
        { name: '..', path: parentDir(path), isDirectory: true, size: 0, mtimeMs: 0 } as ListDirEntry,
        ...entries
      ]

  useEffect(() => {
    if (!focused || selected.size !== 1) return
    const el = containerRef.current?.querySelector('.file-row.selected')
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selected, focused])

  useEffect(() => {
    if (focused && isActive) {
      containerRef.current?.focus()
    }
  }, [focused, isActive])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const onlyStr = selected.size === 1 ? [...selected][0] : null
    let idx = displayEntries.findIndex((x) => x.path === onlyStr)
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < displayEntries.length - 1) onSelect([displayEntries[idx + 1].path], false)
      else if (idx === -1 && displayEntries.length > 0) onSelect([displayEntries[0].path], false)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) onSelect([displayEntries[idx - 1].path], false)
      else if (idx === -1 && displayEntries.length > 0) onSelect([displayEntries[0].path], false)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (displayEntries.length > 0) onSelect([displayEntries[0].path], false)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (displayEntries.length > 0) onSelect([displayEntries[displayEntries.length - 1].path], false)
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      if (displayEntries.length > 0) {
        const nextIdx = Math.max(0, (idx === -1 ? 0 : idx) - 10)
        onSelect([displayEntries[nextIdx].path], false)
      }
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      if (displayEntries.length > 0) {
        const nextIdx = Math.min(displayEntries.length - 1, (idx === -1 ? 0 : idx) + 10)
        onSelect([displayEntries[nextIdx].path], false)
      }
    } else if (e.key === 'Enter') {
      if (!onlyStr) return
      const entry = displayEntries.find((x) => x.path === onlyStr)
      if (!entry) return
      e.preventDefault()
      if (entry.name === '..') {
        onPathChange(entry.path)
      } else {
        onActivate(entry)
      }
    } else if (e.key === ' ') {
      if (!onlyStr) return
      const entry = displayEntries.find((x) => x.path === onlyStr)
      if (!entry || !entry.isDirectory || entry.name === '..') return
      e.preventDefault()
      
      const p = entry.path
      setCalculating((prev) => new Set([...prev, p]))
      void window.ananke.fs.getFolderSize(p).then((sz) => {
        setFolderSizes((prev) => ({ ...prev, [p]: sz }))
        setCalculating((prev) => {
          const next = new Set(prev)
          next.delete(p)
          return next
        })
      })
    }
  }

  return (
    <div
      ref={containerRef}
      className={`file-list-wrap ${focused ? 'focused' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="path-bar" title={path}>
        {path}
      </div>
      <div className="file-rows" style={{ overflow: 'auto', flex: 1 }}>
        {displayEntries.map((e) => {
          const isSelected = selected.has(e.path)
          const isCalc = calculating.has(e.path)
          const fSize = folderSizes[e.path]
          const isParent = e.name === '..'
          return (
            <div
              key={e.path}
              className={`file-row ${isSelected ? 'selected' : ''} ${isCalc ? 'calculating' : ''}`}
              onClick={(ev) => {
                containerRef.current?.focus()
                onSelect([e.path], ev.metaKey || ev.ctrlKey)
              }}
              onDoubleClick={() => isParent ? onPathChange(e.path) : onActivate(e)}
            >
              <div className="file-row-content">
                <span className="name">{isParent ? '⤴️ ' : e.isDirectory ? '🗂 ' : '📄 '}{e.name}</span>
                <span className="muted">
                  {e.isDirectory ? (fSize !== undefined ? formatSize(fSize) : '') : formatSize(e.size)}
                </span>
              </div>
              {isCalc && (
                <div className="file-row-calc-msg">Calculating size...</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
