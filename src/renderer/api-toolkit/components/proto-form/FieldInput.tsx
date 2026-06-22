/**
 * Field dispatcher — routes a field to the repeated / map / scalar-or-message
 * renderer.
 */

import type { FieldSchema } from '../../../../shared/api-toolkit-contracts'
import { MapField } from './MapField'
import { RepeatedField } from './RepeatedField'
import { ScalarOrMessage } from './ScalarOrMessage'
import { typeLabel } from './shared'

export function FieldInput({ field, value, onChange, depth }: {
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
