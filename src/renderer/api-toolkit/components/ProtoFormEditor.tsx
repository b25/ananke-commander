/**
 * ProtoFormEditor — renders a form from a MessageSchema + keeps a JSON value in sync.
 * Handles: scalars, enums, nested messages, repeated, map, oneof, well-known types.
 */

import type { MessageSchema } from '../../../shared/api-toolkit-contracts'
import { FieldInput } from './proto-form/FieldInput'
import { OneofGroup } from './proto-form/OneofGroup'
import { groupByOneof } from './proto-form/shared'

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
