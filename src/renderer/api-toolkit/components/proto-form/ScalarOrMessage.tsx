/**
 * Scalar or nested message renderer — dispatches well-known types, recurses into
 * nested messages (with depth guard), and renders enum/bool/bytes/number/string
 * scalars.
 */

import type { FieldSchema } from '../../../../shared/api-toolkit-contracts'
import { ProtoFormEditor } from '../ProtoFormEditor'
import { WktField } from './WktField'

export function ScalarOrMessage({ field, value, onChange, depth }: {
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
          style={{ minHeight: 60, fontSize: 10 }}
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
        <span style={{ fontSize: 10, color: 'var(--text-1)' }}>{value ? 'true' : 'false'}</span>
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
