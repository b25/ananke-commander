/**
 * Map field renderer — key/value editor with add/remove.
 */

import type { FieldSchema } from '../../../../shared/api-toolkit-contracts'

export function MapField({ field, value, onChange }: {
  field: FieldSchema
  value: Record<string, unknown>
  onChange: (v: unknown) => void
}) {
  const obj = value ?? {}
  const entries = Object.entries(obj)

  function updateKey(oldKey: string, newKey: string) {
    const next = { ...obj }
    const v = next[oldKey]
    delete next[oldKey]
    next[newKey] = v
    onChange(next)
  }

  function updateVal(k: string, v: unknown) {
    onChange({ ...obj, [k]: v })
  }

  function add() {
    onChange({ ...obj, '': '' })
  }

  function remove(k: string) {
    const next = { ...obj }
    delete next[k]
    onChange(next)
  }

  return (
    <div className="form-field">
      <label className="form-label">
        {field.name}
        <span className="type-hint">map&lt;{field.mapKeyType}, {field.mapValueType}&gt;</span>
      </label>
      <div className="kv-editor">
        {entries.map(([k, v], i) => (
          <div className="kv-row" key={i}>
            <input className="kv-input" value={k} placeholder="key" onChange={(e) => updateKey(k, e.target.value)} />
            <input className="kv-input" value={String(v ?? '')} placeholder="value" onChange={(e) => updateVal(k, e.target.value)} />
            <button type="button" className="kv-del" aria-label={`Remove map entry ${k || 'empty key'}`} onClick={() => remove(k)}>×</button>
          </div>
        ))}
        <button type="button" className="kv-add-btn" onClick={add}>+ Add entry</button>
      </div>
    </div>
  )
}
