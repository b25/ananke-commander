import type { KeyValue } from '../../../shared/api-toolkit-contracts'

interface Props {
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

export function KvEditor({ rows, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }: Props) {
  function update(i: number, patch: Partial<KeyValue>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange(next)
  }

  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  function add() {
    onChange([...rows, { key: '', value: '', enabled: true }])
  }

  return (
    <div className="kv-editor">
      {rows.map((row, i) => (
        <div className="kv-row" key={i}>
          <input
            type="checkbox"
            className="kv-check"
            checked={row.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
          />
          <input
            className="kv-input"
            value={row.key}
            placeholder={keyPlaceholder}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className="kv-input"
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <span className="kv-del" onClick={() => remove(i)}>×</span>
        </div>
      ))}
      <span className="kv-add-btn" onClick={add}>+ Add row</span>
    </div>
  )
}
