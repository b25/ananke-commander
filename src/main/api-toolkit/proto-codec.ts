/**
 * proto-codec.ts
 *
 * Handles:
 *   1. Loading .proto content (text or file list) into a protobufjs Root
 *   2. Walking the Root to produce MessageSchema trees (for the form editor)
 *   3. JSON → protobuf message encoding
 *   4. protobuf message → JSON decoding with well-known-type handling
 */

import * as protobuf from 'protobufjs'
import type { MessageSchema, FieldSchema, FieldType, ProtoService, ProtoDiscovery, WellKnownType } from '../../shared/api-toolkit-contracts.js'

// Well-known type full names
const WKT_NAMES: Record<string, WellKnownType> = {
  'google.protobuf.Timestamp': 'Timestamp',
  'google.protobuf.Duration': 'Duration',
  'google.protobuf.Any': 'Any',
  'google.protobuf.Struct': 'Struct',
  'google.protobuf.Value': 'Value',
  'google.protobuf.ListValue': 'ListValue',
  'google.protobuf.FieldMask': 'FieldMask',
  'google.protobuf.Empty': 'Empty',
  'google.protobuf.StringValue': 'StringValue',
  'google.protobuf.BytesValue': 'BytesValue',
  'google.protobuf.BoolValue': 'BoolValue',
  'google.protobuf.Int32Value': 'Int32Value',
  'google.protobuf.Int64Value': 'Int64Value',
  'google.protobuf.UInt32Value': 'UInt32Value',
  'google.protobuf.UInt64Value': 'UInt64Value',
  'google.protobuf.FloatValue': 'FloatValue',
  'google.protobuf.DoubleValue': 'DoubleValue',
}

const PROTO_TYPE_MAP: Record<string, FieldType> = {
  double: 'double', float: 'float', int32: 'int32', int64: 'int64',
  uint32: 'uint32', uint64: 'uint64', sint32: 'sint32', sint64: 'sint64',
  fixed32: 'fixed32', fixed64: 'fixed64', sfixed32: 'sfixed32', sfixed64: 'sfixed64',
  bool: 'bool', string: 'string', bytes: 'bytes',
}

// ─── Root building ────────────────────────────────────────────────────────────

export function buildRootFromText(protoText: string): protobuf.Root {
  const root = new protobuf.Root()
  // Add google well-known types automatically
  protobuf.common('google/protobuf/timestamp.proto', root)
  protobuf.common('google/protobuf/duration.proto', root)
  protobuf.common('google/protobuf/any.proto', root)
  protobuf.common('google/protobuf/struct.proto', root)
  protobuf.common('google/protobuf/wrappers.proto', root)
  protobuf.common('google/protobuf/field_mask.proto', root)
  protobuf.common('google/protobuf/empty.proto', root)
  protobuf.parse(protoText, root, { keepCase: false })
  root.resolveAll()
  return root
}

export function buildRootFromFiles(
  files: Array<{ name: string; content: string }>,
  entryFile: string
): protobuf.Root {
  const root = new protobuf.Root()
  const fileMap = new Map(files.map((f) => [f.name, f.content]))

  root.resolvePath = (_origin: string, target: string) => target

  // Parse all supplied files into the root (ignore duplicates)
  for (const file of files) {
    try {
      protobuf.parse(file.content, root, { keepCase: false })
    } catch {
      // ignore per-file parse errors; report will surface from entry file if needed
    }
  }

  // Re-parse entry file to surface any real errors
  if (fileMap.has(entryFile)) {
    try {
      protobuf.parse(fileMap.get(entryFile)!, root, { keepCase: false })
    } catch { /* already parsed above */ }
  }

  // Ensure WKTs are present
  for (const wkt of ['timestamp', 'duration', 'any', 'struct', 'wrappers', 'field_mask', 'empty']) {
    protobuf.common(`google/protobuf/${wkt}.proto`, root)
  }

  root.resolveAll()
  return root
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export function discoverServices(root: protobuf.Root): ProtoDiscovery {
  const services: ProtoService[] = []
  const schemas: Record<string, MessageSchema> = {}

  walkNamespace(root, services, schemas)

  return { services, schemas }
}

function walkNamespace(
  ns: protobuf.NamespaceBase,
  services: ProtoService[],
  schemas: Record<string, MessageSchema>
): void {
  for (const obj of ns.nestedArray) {
    if (obj instanceof protobuf.Service) {
      services.push(serviceToContract(obj))
    } else if (obj instanceof protobuf.Type) {
      const schema = typeToSchema(obj)
      schemas[obj.fullName.replace(/^\./, '')] = schema
    }
    if ('nestedArray' in obj) {
      walkNamespace(obj as protobuf.NamespaceBase, services, schemas)
    }
  }
}

function serviceToContract(svc: protobuf.Service): ProtoService {
  return {
    name: svc.name,
    fullName: svc.fullName.replace(/^\./, ''),
    methods: svc.methodsArray.map((m) => ({
      name: m.name,
      fullName: m.fullName.replace(/^\./, ''),
      requestType: m.resolvedRequestType?.fullName.replace(/^\./, '') ?? m.requestType,
      responseType: m.resolvedResponseType?.fullName.replace(/^\./, '') ?? m.responseType,
      clientStreaming: m.requestStream ?? false,
      serverStreaming: m.responseStream ?? false,
    })),
  }
}

export function typeToSchema(type: protobuf.Type): MessageSchema {
  const oneofNames = type.oneofsArray.map((o) => o.name)

  const fields: FieldSchema[] = type.fieldsArray.map((f) => {
    f.resolve()
    const wkt = f.resolvedType instanceof protobuf.Type
      ? WKT_NAMES[f.resolvedType.fullName.replace(/^\./, '')]
      : undefined

    const base: FieldSchema = {
      name: f.name,
      number: f.id,
      type: protoFieldType(f),
      label: f.repeated ? 'repeated' : f.required ? 'required' : 'optional',
      jsonName: f.name,
      wellKnownType: wkt,
    }

    if (f.resolvedType instanceof protobuf.Type && !wkt) {
      base.nested = typeToSchema(f.resolvedType)
      base.typeName = f.resolvedType.fullName.replace(/^\./, '')
    } else if (f.resolvedType instanceof protobuf.Enum) {
      base.type = 'enum'
      base.typeName = f.resolvedType.fullName.replace(/^\./, '')
      base.enumValues = Object.keys(f.resolvedType.values)
    }

    if (f.partOf) {
      base.oneofGroup = f.partOf.name
    }

    return base
  })

  // Map fields
  for (const mf of type.fieldsArray) {
    if (mf instanceof protobuf.MapField) {
      const field = fields.find((fld) => fld.name === mf.name)
      if (field) {
        field.type = 'map'
        field.mapKeyType = mf.keyType
        field.mapValueType = mf.type
        if (mf.resolvedType instanceof protobuf.Type) {
          field.mapValueSchema = typeToSchema(mf.resolvedType)
        }
      }
    }
  }

  return { name: type.name, fullName: type.fullName.replace(/^\./, ''), fields, oneofs: oneofNames }
}

function protoFieldType(f: protobuf.Field): FieldType {
  if (f instanceof protobuf.MapField) return 'map'
  if (f.resolvedType instanceof protobuf.Type) return 'message'
  if (f.resolvedType instanceof protobuf.Enum) return 'enum'
  return (PROTO_TYPE_MAP[f.type] ?? 'string') as FieldType
}

// ─── JSON → message ───────────────────────────────────────────────────────────

export function jsonToMessage(
  root: protobuf.Root,
  typeName: string,
  json: unknown
): Uint8Array {
  const MsgType = root.lookupType(typeName)
  const payload = preprocessJsonForProto(typeName, json, root)
  const err = MsgType.verify(payload)
  if (err) throw new Error(`Invalid message: ${err}`)
  const msg = MsgType.create(payload)
  return MsgType.encode(msg).finish()
}

function preprocessJsonForProto(
  typeName: string,
  json: unknown,
  root: protobuf.Root
): Record<string, unknown> {
  if (typeof json !== 'object' || json === null) return {}
  const wkt = WKT_NAMES[typeName]
  if (wkt) return decodeWktFromJson(wkt, json)

  const result: Record<string, unknown> = {}
  const obj = json as Record<string, unknown>
  const MsgType = root.lookupType(typeName)

  for (const [k, v] of Object.entries(obj)) {
    const field = MsgType.fields[k]
    if (!field) { result[k] = v; continue }
    field.resolve()

    if (field.resolvedType instanceof protobuf.Type) {
      const nestedFull = field.resolvedType.fullName.replace(/^\./, '')
      if (WKT_NAMES[nestedFull]) {
        result[k] = field.repeated
          ? (v as unknown[]).map((item) => decodeWktFromJson(WKT_NAMES[nestedFull]!, item))
          : decodeWktFromJson(WKT_NAMES[nestedFull]!, v)
      } else {
        result[k] = field.repeated
          ? (v as unknown[]).map((item) => preprocessJsonForProto(nestedFull, item, root))
          : preprocessJsonForProto(nestedFull, v, root)
      }
    } else {
      result[k] = v
    }
  }
  return result
}

function decodeWktFromJson(wkt: WellKnownType, json: unknown): Record<string, unknown> {
  switch (wkt) {
    case 'Timestamp': {
      const d = new Date(json as string)
      return { seconds: Math.floor(d.getTime() / 1000), nanos: (d.getTime() % 1000) * 1_000_000 }
    }
    case 'Duration': {
      const s = String(json).replace('s', '')
      const n = parseFloat(s)
      return { seconds: Math.floor(n), nanos: Math.round((n % 1) * 1e9) }
    }
    case 'FieldMask':
      return { paths: String(json).split(',').map((p) => p.trim()) }
    case 'Struct':
      return { fields: structToProtoFields(json as Record<string, unknown>) }
    case 'Value':
      return valueToProto(json)
    case 'ListValue':
      return { values: (json as unknown[]).map(valueToProto) }
    case 'Empty':
      return {}
    default:
      return { value: json }
  }
}

function structToProtoFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = valueToProto(v)
  return out
}

function valueToProto(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: 0 }
  if (typeof v === 'number') return { numberValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { boolValue: v }
  if (Array.isArray(v)) return { listValue: { values: v.map(valueToProto) } }
  if (typeof v === 'object') return { structValue: { fields: structToProtoFields(v as Record<string, unknown>) } }
  return { nullValue: 0 }
}

// ─── Message → JSON ───────────────────────────────────────────────────────────

export function messageToJson(
  root: protobuf.Root,
  typeName: string,
  bytes: Uint8Array
): unknown {
  const MsgType = root.lookupType(typeName)
  const msg = MsgType.decode(bytes)
  const obj = MsgType.toObject(msg, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true,
  })
  return postprocessMessageToJson(typeName, obj, root)
}

function postprocessMessageToJson(
  typeName: string,
  obj: Record<string, unknown>,
  root: protobuf.Root
): unknown {
  const wkt = WKT_NAMES[typeName]
  if (wkt) return encodeWktToJson(wkt, obj)

  const result: Record<string, unknown> = {}
  let MsgType: protobuf.Type
  try { MsgType = root.lookupType(typeName) } catch { return obj }

  for (const [k, v] of Object.entries(obj)) {
    const field = MsgType.fields[k]
    if (!field) { result[k] = v; continue }
    field.resolve()

    if (field.resolvedType instanceof protobuf.Type) {
      const nestedFull = field.resolvedType.fullName.replace(/^\./, '')
      const nestedWkt = WKT_NAMES[nestedFull]
      if (nestedWkt) {
        result[k] = field.repeated
          ? (v as Record<string, unknown>[]).map((item) => encodeWktToJson(nestedWkt, item))
          : encodeWktToJson(nestedWkt, v as Record<string, unknown>)
      } else {
        result[k] = field.repeated
          ? (v as Record<string, unknown>[]).map((item) => postprocessMessageToJson(nestedFull, item, root))
          : postprocessMessageToJson(nestedFull, v as Record<string, unknown>, root)
      }
    } else {
      result[k] = v
    }
  }
  return result
}

function encodeWktToJson(wkt: WellKnownType, obj: Record<string, unknown>): unknown {
  switch (wkt) {
    case 'Timestamp': {
      const secs = Number(obj.seconds ?? 0)
      const nanos = Number(obj.nanos ?? 0)
      return new Date(secs * 1000 + nanos / 1_000_000).toISOString().replace('.000Z', 'Z')
    }
    case 'Duration': {
      const secs = Number(obj.seconds ?? 0)
      const nanos = Number(obj.nanos ?? 0)
      const total = secs + nanos / 1e9
      return `${total}s`
    }
    case 'FieldMask':
      return (obj.paths as string[])?.join(',') ?? ''
    case 'Struct':
      return protoFieldsToStruct(obj.fields as Record<string, unknown>)
    case 'Value':
      return protoToValue(obj)
    case 'ListValue':
      return (obj.values as Record<string, unknown>[])?.map(protoToValue) ?? []
    case 'Empty':
      return {}
    default:
      return obj.value !== undefined ? obj.value : obj
  }
}

function protoFieldsToStruct(fields: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = {}
  if (!fields) return out
  for (const [k, v] of Object.entries(fields)) out[k] = protoToValue(v as Record<string, unknown>)
  return out
}

function protoToValue(v: Record<string, unknown>): unknown {
  if (!v) return null
  if ('nullValue' in v) return null
  if ('numberValue' in v) return v.numberValue
  if ('stringValue' in v) return v.stringValue
  if ('boolValue' in v) return v.boolValue
  if ('structValue' in v) return protoFieldsToStruct(((v.structValue as Record<string, unknown>).fields) as Record<string, unknown>)
  if ('listValue' in v) return ((v.listValue as Record<string, unknown>).values as Record<string, unknown>[])?.map(protoToValue) ?? []
  return null
}
