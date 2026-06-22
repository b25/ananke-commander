/**
 * Repeated field renderer — list of scalar/message items with add/remove.
 */

import type { FieldSchema } from '../../../../shared/api-toolkit-contracts'
import { ScalarOrMessage } from './ScalarOrMessage'
import { defaultFor, typeLabel } from './shared'

export function RepeatedField({ field, value, onChange, depth }: {
  field: FieldSchema
  value: unknown[]
  onChange: (v: unknown) => void
  depth: number
}) {
  const arr = Array.isArray(value) ? value : []

  function update(i: number, v: unknown) {
    const next = [...arr]
    next[i] = v
    onChange(next)
  }

  function add() {
    onChange([...arr, defaultFor(field)])
  }

  function remove(i: number) {
    onChange(arr.filter((_, idx) => idx !== i))
  }

  return (
    <div className="form-field">
      <label className="form-label">
        {field.name}
        <span className="type-hint">[]{typeLabel(field)}</span>
      </label>
      <div className="repeated-field">
        {arr.map((item, i) => (
          <div className="repeated-item" key={i}>
            <div style={{ flex: 1 }}>
              <ScalarOrMessage field={field} value={item} onChange={(v) => update(i, v)} depth={depth} />
            </div>
            <button type="button" className="remove-item-btn" onClick={() => remove(i)}>−</button>
          </div>
        ))}
        <button type="button" className="add-item-btn" onClick={add}>+ Add item</button>
      </div>
    </div>
  )
}
