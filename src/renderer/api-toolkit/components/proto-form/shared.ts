/**
 * Shared helpers + grouping types for the proto-form field renderers.
 */

import type { MessageSchema, FieldSchema } from '../../../../shared/api-toolkit-contracts'

export function typeLabel(f: FieldSchema): string {
  if (f.wellKnownType) return f.wellKnownType
  if (f.type === 'map') return `map<${f.mapKeyType},${f.mapValueType}>`
  if (f.type === 'message') return f.typeName?.split('.').pop() ?? 'message'
  if (f.type === 'enum') return f.typeName?.split('.').pop() ?? 'enum'
  return f.type
}

export function defaultFor(f: FieldSchema): unknown {
  if (f.type === 'bool') return false
  if (['int32', 'int64', 'uint32', 'uint64', 'float', 'double',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'].includes(f.type)) return 0
  if (f.type === 'message') return {}
  if (f.type === 'enum') return f.enumValues?.[0] ?? ''
  return ''
}

export function isoToLocal(iso: string): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 19) } catch { return '' }
}

export function localToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

export interface GroupedField {
  type: 'field'
  field: FieldSchema
}
export interface GroupedOneof {
  type: 'oneof'
  name: string
  fields: FieldSchema[]
}
export type Grouped = GroupedField | GroupedOneof

export function groupByOneof(schema: MessageSchema): Grouped[] {
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
