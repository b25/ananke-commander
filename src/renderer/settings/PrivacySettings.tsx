import type { PrivacySettings } from '../../shared/contracts'

type Props = {
  value: PrivacySettings
  onChange: (next: PrivacySettings) => void
  onPurgeRecentlyClosed: () => void
}

function numField(
  label: string,
  v: number,
  onChange: (n: number) => void,
  min = 1,
  max = 100_000
) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span className="muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={v}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        style={{ width: 100 }}
      />
    </label>
  )
}

export function PrivacySettings({ value, onChange, onPurgeRecentlyClosed }: Props) {
  return (
    <>
      <p className="muted">Retention limits (saved with Settings)</p>
      {numField('Terminal scrollback lines', value.terminalHistoryMax, (n) =>
        onChange({ ...value, terminalHistoryMax: n })
      )}
      {numField('Browser recent URLs', value.browserHistoryMax, (n) =>
        onChange({ ...value, browserHistoryMax: n })
      )}
      {numField('Notes undo steps', value.notesUndoMax, (n) => onChange({ ...value, notesUndoMax: n }))}
      {numField('Recently closed max', value.recentlyClosedMax, (n) =>
        onChange({ ...value, recentlyClosedMax: n })
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <input
          type="checkbox"
          checked={value.privateMode}
          onChange={(e) => onChange({ ...value, privateMode: e.target.checked })}
        />
        Private mode (do not record recently closed panes)
      </label>
      <button type="button" onClick={onPurgeRecentlyClosed}>
        Clear all recently closed
      </button>
    </>
  )
}
