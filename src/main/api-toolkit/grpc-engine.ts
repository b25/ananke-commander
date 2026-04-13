/**
 * grpc-engine.ts
 *
 * Manages gRPC channels and handles all 4 call types.
 * Proto discovery via file / text / server-reflection.
 */

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import * as protobuf from 'protobufjs'
import { GrpcReflection } from 'grpc-js-reflection-client'
import type { GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus, TlsConfig, ProtoDiscovery, ProtoSource } from '../../shared/api-toolkit-contracts.js'
import {
  buildRootFromText,
  buildRootFromFiles,
  discoverServices,
  jsonToMessage,
  messageToJson,
} from './proto-codec.js'

const STATUS_NAMES: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
  10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED', 13: 'INTERNAL',
  14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED',
}

// Root cache: keyed by a stable hash of proto source
const rootCache = new Map<string, protobuf.Root>()

function sourceKey(req: GrpcRequest): string {
  const s = req.protoSource
  if (s.type === 'file') return `file:${s.entryFile}:${s.files.map((f) => f.name).join(',')}:${req.endpoint}`
  if (s.type === 'reflection') return `reflection:${req.endpoint}`
  if (s.type === 'text') return `text:${s.content.slice(0, 64)}`
  return 'unknown'
}

async function getRoot(req: GrpcRequest): Promise<protobuf.Root> {
  const key = sourceKey(req)
  if (rootCache.has(key)) return rootCache.get(key)!

  let root: protobuf.Root

  const src: ProtoSource = req.protoSource
  if (src.type === 'text') {
    root = buildRootFromText(src.content)
  } else if (src.type === 'file') {
    root = buildRootFromFiles(src.files, src.entryFile)
  } else {
    // server reflection — list all services, fetch Descriptor for each, merge roots
    const creds = buildCredentials(req.tls)
    const reflectionClient = new GrpcReflection(req.endpoint, creds)
    const serviceNames = await reflectionClient.listServices()
    const roots: protobuf.Root[] = []
    for (const svc of serviceNames) {
      try {
        const descriptor = await reflectionClient.getDescriptorBySymbol(svc)
        // grpc-js-reflection-client bundles protobufjs@7; cast to our @8 Root (structurally compatible at runtime)
        roots.push(descriptor.getProtobufJsRoot() as unknown as protobuf.Root)
      } catch { /* skip unavailable service */ }
    }
    root = roots.length > 0 ? mergeRoots(roots) : new protobuf.Root()
    root.resolveAll()
  }

  rootCache.set(key, root)
  return root
}

function mergeRoots(roots: protobuf.Root[]): protobuf.Root {
  if (roots.length === 1) return roots[0]
  const base = roots[0]
  for (const other of roots.slice(1)) {
    for (const nested of other.nestedArray) {
      try { base.add(nested) } catch { /* duplicate — already present */ }
    }
  }
  return base
}

export function invalidateCache(endpoint: string): void {
  for (const key of rootCache.keys()) {
    if (key.includes(endpoint)) rootCache.delete(key)
  }
}

function buildCredentials(tls: TlsConfig): grpc.ChannelCredentials {
  if (tls.mode === 'none') return grpc.credentials.createInsecure()

  const caBuffer = tls.caCert ? Buffer.from(tls.caCert) : null
  const certBuffer = tls.clientCert ? Buffer.from(tls.clientCert) : null
  const keyBuffer = tls.clientKey ? Buffer.from(tls.clientKey) : null

  return grpc.credentials.createSsl(caBuffer, keyBuffer, certBuffer, {
    checkServerIdentity: tls.insecure
      ? () => undefined
      : undefined,
  })
}

function buildMetadata(kvs: GrpcRequest['metadata']): grpc.Metadata {
  const meta = new grpc.Metadata()
  for (const kv of kvs) {
    if (kv.enabled && kv.key.trim()) {
      const k = kv.key.trim().toLowerCase()
      if (k.endsWith('-bin')) {
        meta.add(k, Buffer.from(kv.value, 'base64'))
      } else {
        meta.add(k, kv.value)
      }
    }
  }
  return meta
}

function metadataToRecord(meta: grpc.Metadata): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, vs] of Object.entries(meta.getMap())) {
    out[k] = String(vs)
  }
  return out
}

function grpcStatusCode(code: grpc.status): GrpcStatus {
  return { code, codeName: STATUS_NAMES[code] ?? `STATUS_${code}`, details: '' }
}

function parseServiceMethod(serviceMethod: string): [string, string] {
  const parts = serviceMethod.split('/')
  if (parts.length === 2) return [parts[0], parts[1]]
  // handle pkg.Service/Method
  const last = parts[parts.length - 1]
  const svc = parts.slice(0, -1).join('.')
  return [svc, last]
}

function resolveTypes(root: protobuf.Root, serviceMethod: string): { reqType: string; respType: string; clientStream: boolean; serverStream: boolean } {
  const [svcName, methodName] = parseServiceMethod(serviceMethod)
  const svc = root.lookupService(svcName)
  const method = svc.methods[methodName]
  if (!method) throw new Error(`Method ${methodName} not found in service ${svcName}`)
  method.resolve()
  return {
    reqType: method.resolvedRequestType?.fullName.replace(/^\./, '') ?? method.requestType,
    respType: method.resolvedResponseType?.fullName.replace(/^\./, '') ?? method.responseType,
    clientStream: method.requestStream ?? false,
    serverStream: method.responseStream ?? false,
  }
}

// ─── Discover ─────────────────────────────────────────────────────────────────

export async function discoverProto(req: GrpcRequest): Promise<ProtoDiscovery> {
  const root = await getRoot(req)
  return discoverServices(root)
}

// ─── Unary call ───────────────────────────────────────────────────────────────

export async function grpcUnary(req: GrpcRequest): Promise<GrpcResponse> {
  const start = Date.now()
  const root = await getRoot(req)
  const { reqType, respType } = resolveTypes(root, req.serviceMethod)

  const [svcName, methodName] = parseServiceMethod(req.serviceMethod)
  const creds = buildCredentials(req.tls)
  const client = new grpc.Client(req.endpoint, creds)

  const reqBytes = jsonToMessage(root, reqType, JSON.parse(req.messageJson))

  const deadline = req.deadline && req.deadline > 0
    ? new Date(Date.now() + req.deadline)
    : undefined

  return new Promise<GrpcResponse>((resolve, reject) => {
    const call = (client as unknown as Record<string, (...args: unknown[]) => grpc.ClientUnaryCall>)[methodName](
      reqBytes,
      buildMetadata(req.metadata),
      deadline ? { deadline } : {},
      (err: grpc.ServiceError | null, response: Uint8Array, trailer: grpc.Metadata) => {
        const status: GrpcStatus = err
          ? { code: err.code ?? grpc.status.UNKNOWN, codeName: STATUS_NAMES[err.code ?? 2] ?? 'UNKNOWN', details: err.details ?? err.message }
          : grpcStatusCode(grpc.status.OK)

        const messages: GrpcMessage[] = []
        if (response) {
          messages.push({ json: JSON.stringify(messageToJson(root, respType, response), null, 2), timestamp: Date.now(), direction: 'recv' })
        }

        resolve({
          messages,
          status,
          metadata: {},
          trailers: trailer ? metadataToRecord(trailer) : {},
          timings: { total: Date.now() - start },
        })
      }
    )
    void call
  }).finally(() => client.close())
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onMessage: (msg: GrpcMessage) => void
  onEnd: (status: GrpcStatus, trailers: Record<string, string>) => void
  onError: (err: string) => void
}

export interface StreamHandle {
  sendMessage: (jsonStr: string) => void
  cancel: () => void
}

export async function grpcStream(req: GrpcRequest, callbacks: StreamCallbacks): Promise<StreamHandle> {
  const root = await getRoot(req)
  const { reqType, respType, clientStream, serverStream } = resolveTypes(root, req.serviceMethod)

  const [, methodName] = parseServiceMethod(req.serviceMethod)
  const creds = buildCredentials(req.tls)
  const client = new grpc.Client(req.endpoint, creds)
  const meta = buildMetadata(req.metadata)

  const deadline = req.deadline && req.deadline > 0
    ? new Date(Date.now() + req.deadline)
    : undefined

  const callOpts = deadline ? { deadline } : {}

  function handleRecvStream(stream: grpc.ClientReadableStream<Uint8Array>): void {
    stream.on('data', (chunk: Uint8Array) => {
      try {
        const json = JSON.stringify(messageToJson(root, respType, chunk), null, 2)
        callbacks.onMessage({ json, timestamp: Date.now(), direction: 'recv' })
      } catch (e) {
        callbacks.onError(String(e))
      }
    })
    stream.on('error', (e: grpc.ServiceError) => {
      callbacks.onEnd({ code: e.code ?? 2, codeName: STATUS_NAMES[e.code ?? 2] ?? 'UNKNOWN', details: e.details }, {})
    })
    stream.on('status', (s: grpc.StatusObject) => {
      callbacks.onEnd({ code: s.code, codeName: STATUS_NAMES[s.code] ?? 'UNKNOWN', details: s.details }, metadataToRecord(s.metadata))
    })
  }

  if (!clientStream && serverStream) {
    // server stream
    const reqBytes = jsonToMessage(root, reqType, JSON.parse(req.messageJson))
    const call = (client as unknown as Record<string, (...args: unknown[]) => grpc.ClientReadableStream<Uint8Array>>)[methodName](reqBytes, meta, callOpts)
    handleRecvStream(call)
    return {
      sendMessage: () => { /* no-op */ },
      cancel: () => { call.cancel(); client.close() },
    }
  }

  if (clientStream && !serverStream) {
    // client stream
    const call = (client as unknown as Record<string, (...args: unknown[]) => grpc.ClientWritableStream<Uint8Array>>)[methodName](
      meta,
      callOpts,
      (err: grpc.ServiceError | null, resp: Uint8Array, trailer: grpc.Metadata) => {
        const status: GrpcStatus = err
          ? { code: err.code ?? 2, codeName: STATUS_NAMES[err.code ?? 2] ?? 'UNKNOWN', details: err.details }
          : grpcStatusCode(grpc.status.OK)
        if (resp) {
          callbacks.onMessage({ json: JSON.stringify(messageToJson(root, respType, resp), null, 2), timestamp: Date.now(), direction: 'recv' })
        }
        callbacks.onEnd(status, trailer ? metadataToRecord(trailer) : {})
        client.close()
      }
    )
    return {
      sendMessage: (jsonStr: string) => {
        const bytes = jsonToMessage(root, reqType, JSON.parse(jsonStr))
        call.write(bytes)
      },
      cancel: () => { call.cancel(); client.close() },
    }
  }

  // bidi stream
  const call = (client as unknown as Record<string, (...args: unknown[]) => grpc.ClientDuplexStream<Uint8Array, Uint8Array>>)[methodName](meta, callOpts)
  handleRecvStream(call as unknown as grpc.ClientReadableStream<Uint8Array>)
  return {
    sendMessage: (jsonStr: string) => {
      const bytes = jsonToMessage(root, reqType, JSON.parse(jsonStr))
      call.write(bytes)
    },
    cancel: () => { call.cancel(); client.close() },
  }
}
