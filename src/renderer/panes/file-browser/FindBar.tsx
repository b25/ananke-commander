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
    <div className="find-bar">
      <span className="find-bar-label">Find:</span>
      <input
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
          tabIndex={-1}
        />
        Recursive
      </label>
      {status === 'searching' && (
        <span className="find-bar-status find-bar-status--searching">Searching…</span>
      )}
      {status === 'done' && (
        <span className="find-bar-status">{resultCount} found</span>
      )}
      {status === 'error' && (
        <span className="find-bar-status" style={{ color: 'var(--danger)' }}>Error</span>
      )}
      <button type="button" className="find-bar-close" onClick={onClose} tabIndex={-1}>&times;</button>
    </div>
  )
}
