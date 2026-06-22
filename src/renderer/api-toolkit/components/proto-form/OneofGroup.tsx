/**
 * Oneof group renderer — selector over the group's fields + the active field.
 */

import { useState } from 'react'
import type { FieldSchema } from '../../../../shared/api-toolkit-contracts'
import { FieldInput } from './FieldInput'

export function OneofGroup({ fields, value, onChange, depth }: {
  fields: FieldSchema[]
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
  depth: number
}) {
  const activeField = fields.find((f) => value[f.name] !== undefined && value[f.name] !== null)
  const [selected, setSelected] = useState(activeField?.name ?? fields[0]?.name ?? '')

  function select(name: string) {
    setSelected(name)
    const cleared = { ...value }
    for (const f of fields) delete cleared[f.name]
    onChange(cleared)
  }

  const active = fields.find((f) => f.name === selected)

  return (
    <div className="form-field">
      <div className="form-label" style={{ gap: 8 }}>
        <span>oneof</span>
        <select className="select" value={selected} onChange={(e) => select(e.target.value)} style={{ fontSize: 10 }}>
          {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </div>
      {active && (
        <FieldInput
          field={active}
          value={value[active.name]}
          onChange={(v) => onChange({ ...value, [active.name]: v })}
          depth={depth}
        />
      )}
    </div>
  )
}
