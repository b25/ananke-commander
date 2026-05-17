import { useEffect, useRef } from 'react'

type Props = {
  pattern: string
  recursive: boolean
  status: 'idle' | 'searching' | 'done' | 'error'
  resultCount: number
  onPatternChange: (p: string) => void
  onRecursiveChange: (r: boolean) => void
  onSearch: () => void
  onClose: () => void
}

export function FindBar({
  pattern,
  recursive,
  status,
  resultCount,
  onPatternChange,
  onRecursiveChange,
  onSearch,
  onClose
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="find-bar" role="search" aria-label="Find files">
      <label className="find-bar-label" htmlFor="file-find-input">Find:</label>
      <input
        id="file-find-input"
        ref={inputRef}
        className="find-bar-input"
        placeholder="*.ts · note* · *.{js,tsx}"
        value={pattern}
        onChange={e => onPatternChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.stopPropagation(); onSearch() }
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }}
      />
      <label className="find-bar-recursive">
        <input
          type="checkbox"
          checked={recursive}
          onChange={e => onRecursiveChange(e.target.checked)}
        />
        Recursive
      </label>
      {status === 'searching' && (
        <span className="find-bar-status find-bar-status--searching" role="status" aria-live="polite">Searching…</span>
      )}
      {status === 'done' && (
        <span className="find-bar-status" role="status" aria-live="polite">{resultCount} found</span>
      )}
      {status === 'error' && (
        <span className="find-bar-status" role="alert" style={{ color: 'var(--danger)' }}>Error</span>
      )}
      <button type="button" className="find-bar-close" onClick={onClose} aria-label="Close find bar">&times;</button>
    </div>
  )
}
