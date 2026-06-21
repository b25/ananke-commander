type Props = {
  currentPath: string
  /** Non-null when this side's path bar is in edit mode. */
  editingValue: string | null
  onBeginEdit: () => void
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
}

/** The clickable / editable directory path bar above a file list. */
export function PathBar({ currentPath, editingValue, onBeginEdit, onChange, onCommit, onCancel }: Props) {
  if (editingValue !== null) {
    return (
      <input
        className="path-bar path-bar--editing"
        value={editingValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(editingValue)
          if (e.key === 'Escape') onCancel()
        }}
        autoFocus
      />
    )
  }
  return (
    <div className="path-bar" title={currentPath} onClick={onBeginEdit}>
      {currentPath}
    </div>
  )
}
