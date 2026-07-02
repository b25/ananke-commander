/**
 * grpc-engine.ts
 *
 * Manages gRPC channels and handles all 4 call types.
 * Proto discovery via file / text / server-reflection.
 */

import * as grpc from '@grpc/grpc-js'
import protobuf from 'protobufjs'
import { GrpcReflection } from 'grpc-js-reflection-client'
import { createHash } from 'node:crypto'
import type { GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus, TlsConfig, ProtoDiscovery, ProtoSource } from '../../shared/api-toolkit-contracts.js'
import {
  buildRootFromText,
  buildRootFromFiles,
  discoverServices,
  jsonToMessage,
  messageToJson,
} from './proto-codec.ts'

const STATUS_NAMES: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
  10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED', 13: 'INTERNAL',
  14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED',
}

const ROOT_CACHE_MAX = 32
const rootCache = new Map<string, protobuf.Root>()

function sourceKey(req: GrpcRequest): string {
  const s = req.protoSource
  if (s.type === 'file') {
    const digest = createHash('sha256')
    digest.update(s.entryFile)
    for (const f of s.files) {
      digest.update(f.name)
      digest.update('\x00')
      digest.update(f.content)
      digest.update('\x00')
    }
    return `file:${req.endpoint}:${digest.digest('hex')}`
  }
  if (s.type === 'reflection') return `reflection:${req.endpoint}`
  if (s.type === 'text') return `text:${createHash('sha256').update(s.content).digest('hex')}`
  return 'unknown'
}

function setRootCache(key: string, root: protobuf.Root): void {
  while (rootCache.size >= ROOT_CACHE_MAX) {
    const first = rootCache.keys().next().value
    if (!first) break
    rootCache.delete(first)
  }
  rootCache.set(key, root)
}

async function getRoot(req: GrpcRequest, bustCache = false): Promise<protobuf.Root> {
  const key = bustCache && req.protoSource.type === 'reflection'
    ? `reflection:${req.endpoint}:${Date.now()}`
    : sourceKey(req)
  if (!bustCache && rootCache.has(key)) return rootCache.get(key)!

  let root: protobuf.Root

  const src: ProtoSource = req.protoSource
  if (src.type === 'text') {
    root = buildRootFromText(src.content)
  } else if (src.type === 'file') {
    root = buildRootFromFiles(src.files, src.entryFile)
  } else {
    const creds = buildCredentials(req.tls)
    const reflectionClient = new GrpcReflection(req.endpoint, creds)
    const serviceNames = await reflectionClient.listServices()
    const roots: protobuf.Root[] = []
    for (const svc of serviceNames) {
      try {
        const descriptor = await reflectionClient.getDescriptorBySymbol(svc)
        roots.push(descriptor.getProtobufJsRoot() as unknown as protobuf.Root)
      } catch { /* skip unavailable service */ }
    }
    root = roots.length > 0 ? mergeRoots(roots) : new protobuf.Root()
    root.resolveAll()
  }

  setRootCache(key, root)
  return root
}

function mergeRoots(roots: protobuf.Root[]): protobuf.Root {
  if (roots.length === 1) return roots[0]
  const base = roots[0]
  for (const other of roots.slice(1)) {
    for (const nested of other.nestedArray) {
      try { base.add(nested) } catch { /* duplicate */ }
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
    rejectUnauthorized: !tls.insecure,
  })
}

function buildMetadata(kvs: GrpcRequest['metadata']): grpc.Metadata {
  const meta = new grpc.Metadata()
  for (const kv of kvs) {
    if (kv.enabled && kv.key.trim()) {
      const k = kv.key.trim().toLowerCase()
      if (k.endsWith('-bin')) {
        try {
          meta.add(k, Buffer.from(kv.value, 'base64'))
        } catch {
          throw new Error(`Invalid base64 for metadata ${k}`)
        }
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
  const last = parts[parts.length - 1]
  const svc = parts.slice(0, -1).join('.')
  return [svc, last]
}

function resolveTypes(root: protobuf.Root, serviceMethod: string): { reqType: string; respType: string; clientStream: boolean; serverStream: boolean; grpcPath: string } {
  const [svcName, methodName] = parseServiceMethod(serviceMethod)
  const svc = root.lookupService(svcName)
  const method = svc.methods[methodName]
  if (!method) throw new Error(`Method ${methodName} not found in service ${svcName}`)
  method.resolve()
  const fullSvcName = svc.fullName.replace(/^\./, '')
  return {
    reqType: method.resolvedRequestType?.fullName.replace(/^\./, '') ?? method.requestType,
    respType: method.resolvedResponseType?.fullName.replace(/^\./, '') ?? method.responseType,
    clientStream: method.requestStream ?? false,
    serverStream: method.responseStream ?? false,
    grpcPath: `/${fullSvcName}/${methodName}`,
  }
}

export async function discoverProto(req: GrpcRequest): Promise<ProtoDiscovery> {
  const root = await getRoot(req, true)
  return discoverServices(root)
}

export async function grpcUnary(req: GrpcRequest): Promise<GrpcResponse> {
  const start = Date.now()
  const root = await getRoot(req)
  const { reqType, respType, grpcPath } = resolveTypes(root, req.serviceMethod)
  const reqBytes = jsonToMessage(root, reqType, JSON.parse(req.messageJson))

  const creds = buildCredentials(req.tls)
  const client = new grpc.Client(req.endpoint, creds)

  const deadline = req.deadline && req.deadline > 0
    ? new Date(Date.now() + req.deadline)
    : undefined

  // Identity (pass-through) codecs — payloads are already encoded protobuf bytes.
  const ident = (b: Buffer): Buffer => b

  try {
    return await new Promise<GrpcResponse>((resolve, reject) => {
      let trailers: Record<string, string> = {}

      const call = client.makeUnaryRequest<Buffer, Buffer>(
        grpcPath,
        ident,
        ident,
        Buffer.from(reqBytes),
        buildMetadata(req.metadata),
        deadline ? { deadline } : {},
        (err: grpc.ServiceError | null, response?: Buffer) => {
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
            trailers,
            timings: { total: Date.now() - start },
          })
        },
      )

      // Capture trailers — the 'status' event fires before the callback for unary.
      call.on('status', (s: grpc.StatusObject) => {
        trailers = metadataToRecord(s.metadata)
      })
      call.on('error', (e: Error) => {
        reject(e)
      })
    })
  } finally {
    client.close()
  }
}

export interface StreamCallbacks {
  onMessage: (msg: GrpcMessage) => void
  onEnd: (status: GrpcStatus, trailers: Record<string, string>) => void
  onError: (err: string) => void
}

export interface StreamHandle {
  sendMessage: (jsonStr: string) => void
  cancel: () => void
  /** Half-close the client side of a client-stream or bidi-stream (Task 11). */
  end: () => void
}

export async function grpcStream(req: GrpcRequest, callbacks: StreamCallbacks): Promise<StreamHandle> {
  const root = await getRoot(req)
  const { reqType, respType, clientStream, serverStream, grpcPath } = resolveTypes(root, req.serviceMethod)

  const creds = buildCredentials(req.tls)
  const client = new grpc.Client(req.endpoint, creds)
  const meta = buildMetadata(req.metadata)

  const deadline = req.deadline && req.deadline > 0
    ? new Date(Date.now() + req.deadline)
    : undefined

  const callOpts = deadline ? { deadline } : {}

  // Identity (pass-through) codecs — payloads are already encoded protobuf bytes.
  const ident = (b: Buffer): Buffer => b

  let ended = false
  const finish = (status: GrpcStatus, trailers: Record<string, string>) => {
    if (ended) return
    ended = true
    callbacks.onEnd(status, trailers)
    client.close()
  }

  function handleRecvStream(stream: grpc.ClientReadableStream<Buffer>): void {
    stream.on('data', (chunk: Buffer) => {
      try {
        const json = JSON.stringify(messageToJson(root, respType, chunk), null, 2)
        callbacks.onMessage({ json, timestamp: Date.now(), direction: 'recv' })
      } catch (e) {
        callbacks.onError(String(e))
      }
    })
    stream.on('error', (e: grpc.ServiceError) => {
      finish({ code: e.code ?? 2, codeName: STATUS_NAMES[e.code ?? 2] ?? 'UNKNOWN', details: e.details ?? '' }, {})
    })
    stream.on('status', (s: grpc.StatusObject) => {
      finish({ code: s.code, codeName: STATUS_NAMES[s.code] ?? 'UNKNOWN', details: s.details }, metadataToRecord(s.metadata))
    })
  }

  // ── Server-streaming ──────────────────────────────────────────────────────
  if (!clientStream && serverStream) {
    const reqBytes = jsonToMessage(root, reqType, JSON.parse(req.messageJson))
    const call = client.makeServerStreamRequest<Buffer, Buffer>(grpcPath, ident, ident, Buffer.from(reqBytes), meta, callOpts)
    handleRecvStream(call)
    return {
      sendMessage: () => { /* no-op: server-streaming sends only the initial request */ },
      cancel: () => { call.cancel(); if (!ended) { ended = true; client.close() } },
      end: () => { /* no-op: server-stream has no client-side half-close */ },
    }
  }

  // ── Client-streaming ──────────────────────────────────────────────────────
  if (clientStream && !serverStream) {
    let clientStreamTrailers: Record<string, string> = {}
    const call = client.makeClientStreamRequest<Buffer, Buffer>(
      grpcPath,
      ident,
      ident,
      meta,
      callOpts,
      (err: grpc.ServiceError | null, resp?: Buffer) => {
        const status: GrpcStatus = err
          ? { code: err.code ?? 2, codeName: STATUS_NAMES[err.code ?? 2] ?? 'UNKNOWN', details: err.details ?? '' }
          : grpcStatusCode(grpc.status.OK)
        if (resp) {
          callbacks.onMessage({ json: JSON.stringify(messageToJson(root, respType, resp), null, 2), timestamp: Date.now(), direction: 'recv' })
        }
        finish(status, clientStreamTrailers)
      },
    )
    // Capture real trailers from the server status event (mirrors unary path).
    call.on('status', (s: grpc.StatusObject) => {
      clientStreamTrailers = metadataToRecord(s.metadata)
    })
    return {
      sendMessage: (jsonStr: string) => {
        const bytes = jsonToMessage(root, reqType, JSON.parse(jsonStr))
        call.write(Buffer.from(bytes))
      },
      cancel: () => { call.cancel(); if (!ended) { ended = true; client.close() } },
      end: () => { call.end() },
    }
  }

  // ── Bidi-streaming ────────────────────────────────────────────────────────
  const call = client.makeBidiStreamRequest<Buffer, Buffer>(grpcPath, ident, ident, meta, callOpts)
  handleRecvStream(call)
  return {
    sendMessage: (jsonStr: string) => {
      const bytes = jsonToMessage(root, reqType, JSON.parse(jsonStr))
      call.write(Buffer.from(bytes))
    },
    cancel: () => { call.cancel(); if (!ended) { ended = true; client.close() } },
    end: () => { call.end() },
  }
}
