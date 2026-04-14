// ─── HTTP ────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE'

export interface KeyValue {
  key: string
  value: string
  enabled: boolean
  description?: string
}

export type AuthConfig =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'apiKey'; key: string; value: string; in: 'header' | 'query' }
  | { type: 'oauth2'; accessToken: string }

export interface HttpRequest {
  method: HttpMethod
  url: string
  params: KeyValue[]
  headers: KeyValue[]
  body: HttpBody
  auth: AuthConfig
  timeout: number
}

export interface HttpBody {
  mode: 'none' | 'raw' | 'json' | 'form' | 'multipart' | 'binary' | 'urlencoded'
  raw?: string
  contentType?: string
  formFields?: KeyValue[]
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: { headers: number; body: number }
  timings: { total: number; ttfb?: number; download?: number }
  redirects: Array<{ url: string; status: number }>
}

// ─── gRPC ────────────────────────────────────────────────────────────────────

export type ProtoSourceType = 'file' | 'reflection' | 'text'

export interface ProtoFileSource {
  type: 'file'
  // array of { path: relative, content: base64 or utf8 text }
  files: Array<{ name: string; content: string }>
  entryFile: string
}

export interface ProtoReflectionSource {
  type: 'reflection'
}

export interface ProtoTextSource {
  type: 'text'
  content: string
}

export type ProtoSource = ProtoFileSource | ProtoReflectionSource | ProtoTextSource

export interface TlsConfig {
  mode: 'none' | 'tls' | 'mtls'
  insecure?: boolean
  caCert?: string
  clientCert?: string
  clientKey?: string
}

export interface GrpcRequest {
  endpoint: string
  serviceMethod: string   // "ServiceName/MethodName" or "pkg.ServiceName/MethodName"
  messageJson: string     // JSON string of the request message
  metadata: KeyValue[]
  tls: TlsConfig
  protoSource: ProtoSource
  deadline?: number       // ms, 0 = no deadline
}

export interface GrpcMessage {
  json: string
  timestamp: number
  direction: 'send' | 'recv'
}

export interface GrpcStatus {
  code: number
  codeName: string
  details: string
}

export interface GrpcResponse {
  messages: GrpcMessage[]
  status: GrpcStatus
  metadata: Record<string, string>
  trailers: Record<string, string>
  timings: { total: number }
}

// ─── Proto schema (for form editor) ─────────────────────────────────────────

export interface ProtoService {
  name: string
  fullName: string
  methods: ProtoMethod[]
}

export interface ProtoMethod {
  name: string
  fullName: string
  requestType: string
  responseType: string
  clientStreaming: boolean
  serverStreaming: boolean
}

export type FieldType =
  | 'double' | 'float' | 'int32' | 'int64' | 'uint32' | 'uint64'
  | 'sint32' | 'sint64' | 'fixed32' | 'fixed64' | 'sfixed32' | 'sfixed64'
  | 'bool' | 'string' | 'bytes' | 'message' | 'enum' | 'map'

export type WellKnownType =
  | 'Timestamp' | 'Duration' | 'Any' | 'Struct' | 'Value'
  | 'ListValue' | 'FieldMask' | 'Empty'
  | 'StringValue' | 'BytesValue' | 'BoolValue'
  | 'Int32Value' | 'Int64Value' | 'UInt32Value' | 'UInt64Value'
  | 'FloatValue' | 'DoubleValue'

export interface FieldSchema {
  name: string
  number: number
  type: FieldType
  label: 'optional' | 'required' | 'repeated'
  typeName?: string
  nested?: MessageSchema
  enumValues?: string[]
  mapKeyType?: string
  mapValueType?: string
  mapValueSchema?: MessageSchema
  oneofGroup?: string
  wellKnownType?: WellKnownType
  jsonName: string
}

export interface MessageSchema {
  name: string
  fullName: string
  fields: FieldSchema[]
  oneofs: string[]
}

export interface ProtoDiscovery {
  services: ProtoService[]
  schemas: Record<string, MessageSchema>
}

// ─── Collections & storage ──────────────────────────────────────────────────

export interface Variable {
  key: string
  value: string
  isSecret: boolean
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: Variable[]
  createdAt: number
  updatedAt: number
}

export interface RequestItem {
  type: 'request'
  id: string
  name: string
  protocol: 'http' | 'grpc'
  httpRequest?: HttpRequest
  grpcRequest?: GrpcRequest
  description?: string
}

export interface FolderItem {
  type: 'folder'
  id: string
  name: string
  items: CollectionItem[]
  variables?: Variable[]
}

export type CollectionItem = RequestItem | FolderItem

export interface Collection {
  id: string
  name: string
  description?: string
  items: CollectionItem[]
  variables: Variable[]
  auth?: AuthConfig
  createdAt: number
  updatedAt: number
}

export interface HistoryEntry {
  id: string
  timestamp: number
  protocol: 'http' | 'grpc'
  name: string
  httpRequest?: HttpRequest
  httpResponse?: HttpResponse
  grpcRequest?: GrpcRequest
  grpcResponse?: GrpcResponse
  duration: number
  error?: string
}

// ─── IPC channel names ───────────────────────────────────────────────────────

export const IPC = {
  // HTTP
  HTTP_SEND: 'at:http:send',
  HTTP_CANCEL: 'at:http:cancel',

  // gRPC
  GRPC_DISCOVER: 'at:grpc:discover',
  GRPC_UNARY: 'at:grpc:unary',
  GRPC_STREAM_START: 'at:grpc:stream:start',
  GRPC_STREAM_SEND: 'at:grpc:stream:send',
  GRPC_STREAM_CANCEL: 'at:grpc:stream:cancel',
  GRPC_STREAM_MESSAGE: 'at:grpc:stream:message',
  GRPC_STREAM_END: 'at:grpc:stream:end',
  GRPC_STREAM_ERROR: 'at:grpc:stream:error',

  // Storage
  STORAGE_GET_COLLECTIONS: 'at:storage:getCollections',
  STORAGE_SAVE_COLLECTION: 'at:storage:saveCollection',
  STORAGE_DELETE_COLLECTION: 'at:storage:deleteCollection',
  STORAGE_ADD_COLLECTION_ITEM: 'at:storage:addCollectionItem',
  STORAGE_UPDATE_COLLECTION_ITEM: 'at:storage:updateCollectionItem',
  STORAGE_DELETE_COLLECTION_ITEM: 'at:storage:deleteCollectionItem',
  STORAGE_IMPORT_COLLECTION: 'at:storage:importCollection',
  STORAGE_GET_ENVIRONMENTS: 'at:storage:getEnvironments',
  STORAGE_SAVE_ENVIRONMENT: 'at:storage:saveEnvironment',
  STORAGE_DELETE_ENVIRONMENT: 'at:storage:deleteEnvironment',
  STORAGE_GET_HISTORY: 'at:storage:getHistory',
  STORAGE_ADD_HISTORY: 'at:storage:addHistory',
  STORAGE_CLEAR_HISTORY: 'at:storage:clearHistory',

  // Export / import utilities
  STORAGE_EXPORT_COLLECTION: 'at:storage:exportCollection',
  UTIL_CURL_FROM: 'at:util:curlFrom',
  UTIL_CURL_TO: 'at:util:curlTo',

  // File dialogs
  DIALOG_OPEN_PROTO: 'at:dialog:openProto',
  DIALOG_OPEN_FILE: 'at:dialog:openFile',
  DIALOG_SAVE_FILE: 'at:dialog:saveFile',
} as const
