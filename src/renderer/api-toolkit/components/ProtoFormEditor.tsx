/**
 * ProtoFormEditor — renders a form from a MessageSchema + keeps a JSON value in sync.
 * Handles: scalars, enums, nested messages, repeated, map, oneof, well-known types.
 */

import { useState } from 'react'
import type { MessageSchema, FieldSchema, WellKnownType } from '../../../shared/api-toolkit-contracts'

interface Props {
  schema: MessageSchema
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
  depth?: number
}

export function ProtoFormEditor({ schema, value, onChange, depth = 0 }: Props) {
  // Group fields by oneof
  const grouped = groupByOneof(schema)

  return (
    <div className="proto-form">
      {grouped.map((group) => {
        if (group.type === 'field') {
          return (
            <FieldInput
              key={group.field.name}
              field={group.field}
              value={value[group.field.name]}
              onChange={(v) => onChange({ ...value, [group.field.name]: v })}
              depth={depth}
            />
          )
        }
        // oneof group
        return (
          <OneofGroup
            key={group.name}
            fields={group.fields}
            value={value}
            onChange={onChange}
            depth={depth}
          />
        )
      })}
    </div>
  )
}

// ─── Oneof group ──────────────────────────────────────────────────────────────

function OneofGroup({ fields, value, onChange, depth }: {
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
        <select className="select" value={selected} onChange={(e) => select(e.target.value)} style={{ fontSize: 11 }}>
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

// ─── Field dispatcher ─────────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, depth }: {
  field: FieldSchema
  value: unknown
  onChange: (v: unknown) => void
  depth: number
}) {
  if (field.label === 'repeated') {
    return <RepeatedField field={field} value={value as unknown[]} onChange={onChange} depth={depth} />
  }
  if (field.type === 'map') {
    return <MapField field={field} value={value as Record<string, unknown>} onChange={onChange} />
  }
  return (
    <div className="form-field">
      <label className="form-label">
        {field.name}
        <span className="type-hint">{typeLabel(field)}</span>
      </label>
      <ScalarOrMessage field={field} value={value} onChange={onChange} depth={depth} />
    </div>
  )
}

// ─── Repeated field ───────────────────────────────────────────────────────────

function RepeatedField({ field, value, onChange, depth }: {
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
            <button className="remove-item-btn" onClick={() => remove(i)}>−</button>
          </div>
        ))}
        <button className="add-item-btn" onClick={add}>+ Add item</button>
      </div>
    </div>
  )
}

// ─── Map field ────────────────────────────────────────────────────────────────

function MapField({ field, value, onChange }: {
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
            <span className="kv-del" onClick={() => remove(k)}>×</span>
          </div>
        ))}
        <span className="kv-add-btn" onClick={add}>+ Add entry</span>
      </div>
    </div>
  )
}

// ─── Scalar or nested message ─────────────────────────────────────────────────

function ScalarOrMessage({ field, value, onChange, depth }: {
  field: FieldSchema
  value: unknown
  onChange: (v: unknown) => void
  depth: number
}) {
  if (field.wellKnownType) {
    return <WktField wkt={field.wellKnownType} value={value} onChange={onChange} />
  }

  if (field.type === 'message' && field.nested) {
    if (depth > 5) {
      return (
        <textarea
          className="code-editor"
          style={{ minHeight: 60, fontSize: 11 }}
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : '{}'}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)) } catch { /* ignore */ } }}
        />
      )
    }
    return (
      <div className="nested-form">
        <ProtoFormEditor
          schema={field.nested}
          value={(value as Record<string, unknown>) ?? {}}
          onChange={onChange as (v: Record<string, unknown>) => void}
          depth={depth + 1}
        />
      </div>
    )
  }

  if (field.type === 'enum') {
    return (
      <select
        className="form-input"
        value={String(value ?? field.enumValues?.[0] ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        {field.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  }

  if (field.type === 'bool') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" className="form-checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{value ? 'true' : 'false'}</span>
      </label>
    )
  }

  if (field.type === 'bytes') {
    return (
      <input
        className="form-input"
        placeholder="base64-encoded bytes"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const isNum = ['double', 'float', 'int32', 'int64', 'uint32', 'uint64',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'].includes(field.type)

  return (
    <input
      className="form-input"
      type={isNum ? 'number' : 'text'}
      value={String(value ?? '')}
      placeholder={field.type}
      onChange={(e) => onChange(isNum ? (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) : e.target.value)}
    />
  )
}

// ─── Well-known type widgets ──────────────────────────────────────────────────

function WktField({ wkt, value, onChange }: { wkt: WellKnownType; value: unknown; onChange: (v: unknown) => void }) {
  switch (wkt) {
    case 'Timestamp':
      return (
        <input
          type="datetime-local"
          className="form-input"
          step="1"
          value={isoToLocal(String(value ?? ''))}
          onChange={(e) => onChange(localToIso(e.target.value))}
        />
      )
    case 'Duration':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="form-input"
            type="number"
            step="0.001"
            placeholder="seconds"
            value={String(value ?? '').replace('s', '')}
            onChange={(e) => onChange(`${e.target.value}s`)}
            style={{ flex: 1 }}
          />
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>s</span>
        </div>
      )
    case 'Empty':
      return <span style={{ color: 'var(--text-2)', fontSize: 11 }}>(empty)</span>
    case 'FieldMask':
      return (
        <input
          className="form-input"
          placeholder="field1,field2.subField"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      // Struct/Value/ListValue + wrappers → JSON textarea
      return (
        <textarea
          className="code-editor"
          style={{ minHeight: 60, fontSize: 11 }}
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)) } catch { onChange(e.target.value) } }}
        />
      )
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(f: FieldSchema): string {
  if (f.wellKnownType) return f.wellKnownType
  if (f.type === 'map') return `map<${f.mapKeyType},${f.mapValueType}>`
  if (f.type === 'message') return f.typeName?.split('.').pop() ?? 'message'
  if (f.type === 'enum') return f.typeName?.split('.').pop() ?? 'enum'
  return f.type
}

function defaultFor(f: FieldSchema): unknown {
  if (f.type === 'bool') return false
  if (['int32', 'int64', 'uint32', 'uint64', 'float', 'double',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'].includes(f.type)) return 0
  if (f.type === 'message') return {}
  if (f.type === 'enum') return f.enumValues?.[0] ?? ''
  return ''
}

function isoToLocal(iso: string): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 19) } catch { return '' }
}

function localToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

interface GroupedField {
  type: 'field'
  field: FieldSchema
}
interface GroupedOneof {
  type: 'oneof'
  name: string
  fields: FieldSchema[]
}
type Grouped = GroupedField | GroupedOneof

function groupByOneof(schema: MessageSchema): Grouped[] {
  const result: Grouped[] = []
  const seenOneofs = new Set<string>()
  const oneofMap = new Map<string, FieldSchema[]>()

  for (const f of schema.fields) {
    if (f.oneofGroup) {
      if (!oneofMap.has(f.oneofGroup)) oneofMap.set(f.oneofGroup, [])
      oneofMap.get(f.oneofGroup)!.push(f)
    }
  }

  for (const f of schema.fields) {
    if (f.oneofGroup) {
      if (!seenOneofs.has(f.oneofGroup)) {
        seenOneofs.add(f.oneofGroup)
        result.push({ type: 'oneof', name: f.oneofGroup, fields: oneofMap.get(f.oneofGroup)! })
      }
    } else {
      result.push({ type: 'field', field: f })
    }
  }

  return result
}
