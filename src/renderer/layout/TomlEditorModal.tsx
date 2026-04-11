import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStateSnapshot } from '../../shared/contracts'

interface Props {
  onClose: (newSnap?: AppStateSnapshot) => void
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function TomlEditorModal({ onClose }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [findMode, setFindMode] = useState<'none' | 'find' | 'replace'>('none')
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.ananke.config.readToml().then(t => {
      setText(t ?? '')
      setTimeout(() => textareaRef.current?.focus(), 0)
    })
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: false }))
    return () => {
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [])

  // Compute all match positions (case-insensitive)
  const matches = useMemo(() => {
    if (!findQuery || text === null) return []
    const result: number[] = []
    const lower = text.toLowerCase()
    const q = findQuery.toLowerCase()
    let idx = 0
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      result.push(idx)
      idx += q.length || 1
    }
    return result
  }, [text, findQuery])

  const safeIndex = matches.length > 0 ? Math.min(matchIndex, matches.length - 1) : -1

  // Apply selection in textarea when active match changes
  useEffect(() => {
    if (safeIndex < 0 || !textareaRef.current || findMode === 'none') return
    const start = matches[safeIndex]
    textareaRef.current.setSelectionRange(start, start + findQuery.length)
    textareaRef.current.focus()
  }, [safeIndex, matches, findQuery, findMode])

  const openFind = useCallback((mode: 'find' | 'replace') => {
    setFindMode(mode)
    setTimeout(() => findInputRef.current?.select(), 0)
  }, [])

  const closeFindBar = useCallback(() => {
    setFindMode('none')
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  const goNext = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex(i => (i + 1) % matches.length)
  }, [matches.length])

  const goPrev = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex(i => (i - 1 + matches.length) % matches.length)
  }, [matches.length])

  const handleReplace = useCallback(() => {
    if (safeIndex < 0 || text === null) return
    const start = matches[safeIndex]
    const newText = text.substring(0, start) + replaceQuery + text.substring(start + findQuery.length)
    setText(newText)
    setDirty(true)
    setError(null)
  }, [safeIndex, matches, text, findQuery, replaceQuery])

  const handleReplaceAll = useCallback(() => {
    if (!findQuery || text === null) return
    const newText = text.replace(new RegExp(escapeRegex(findQuery), 'gi'), replaceQuery)
    setText(newText)
    setDirty(true)
    setError(null)
    setMatchIndex(0)
  }, [text, findQuery, replaceQuery])

  const handleSave = useCallback(async () => {
    if (text === null || saving) return
    setSaving(true)
    const { error: err, snapshot } = await window.ananke.config.applyToml(text)
    setSaving(false)
    if (err) { setError(err) } else { onClose(snapshot ?? undefined) }
  }, [text, saving, onClose])

  const handleCancel = useCallback(() => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    onClose()
  }, [dirty, onClose])

  // Keydown on the outer modal div — catches Cmd+F/H from any focused child
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openFind('find') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); openFind('replace') }
  }

  // Keydown on the textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void handleSave() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openFind('find') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); openFind('replace') }
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = el.value.substring(0, start) + '  ' + el.value.substring(end)
      setText(next)
      setDirty(true)
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2 })
    }
    if (e.key === 'Escape') {
      if (findMode !== 'none') { closeFindBar() } else { handleCancel() }
    }
  }

  // Keydown on find/replace inputs
  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() }
    if (e.key === 'Escape') { e.preventDefault(); closeFindBar() }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void handleSave() }
  }

  const matchLabel = matches.length === 0
    ? (findQuery ? 'No matches' : '')
    : `${safeIndex + 1} / ${matches.length}`

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal toml-editor-modal" onClick={e => e.stopPropagation()} onKeyDown={handleModalKeyDown}>
        <div className="toml-editor-header">
          <span className="toml-editor-title">
            workspace.toml{dirty && <span className="toml-dirty">●</span>}
          </span>
          <button type="button" className="toml-editor-close" onClick={handleCancel}>✕</button>
        </div>

        {findMode !== 'none' && (
          <div className="toml-find-bar">
            <div className="toml-find-row">
              <input
                ref={findInputRef}
                className="toml-find-input"
                placeholder="Find…"
                value={findQuery}
                onChange={e => { setFindQuery(e.target.value); setMatchIndex(0) }}
                onKeyDown={handleFindKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="toml-match-label">{matchLabel}</span>
              <button type="button" className="toml-find-btn" title="Previous (⇧Enter)" onClick={goPrev} disabled={matches.length === 0}>↑</button>
              <button type="button" className="toml-find-btn" title="Next (Enter)" onClick={goNext} disabled={matches.length === 0}>↓</button>
              {findMode === 'find' && (
                <button type="button" className="toml-find-btn" title="Find & Replace (⌘H)" onClick={() => openFind('replace')}>⇄</button>
              )}
              <button type="button" className="toml-find-close" title="Close (Esc)" onClick={closeFindBar}>✕</button>
            </div>
            {findMode === 'replace' && (
              <div className="toml-find-row">
                <input
                  className="toml-find-input"
                  placeholder="Replace with…"
                  value={replaceQuery}
                  onChange={e => setReplaceQuery(e.target.value)}
                  onKeyDown={handleFindKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="toml-find-btn" onClick={handleReplace} disabled={safeIndex < 0}>Replace</button>
                <button type="button" className="toml-find-btn" onClick={handleReplaceAll} disabled={matches.length === 0}>All</button>
              </div>
            )}
          </div>
        )}

        {text === null
          ? <div className="toml-editor-loading">Loading…</div>
          : <textarea
              ref={textareaRef}
              className="toml-editor-area"
              value={text}
              onChange={e => { setText(e.target.value); setDirty(true); setError(null) }}
              onKeyDown={handleTextareaKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
        }
        {error && <div className="toml-editor-error">{error}</div>}
        <div className="toml-editor-footer">
          <button type="button" className="primary" onClick={() => void handleSave()} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="toml-editor-hint">⌘S save · ⌘F find · ⌘H replace · Tab = 2 spaces</span>
          <button type="button" onClick={handleCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
