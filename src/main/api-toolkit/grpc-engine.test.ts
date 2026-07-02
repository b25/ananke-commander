/**
 * grpc-engine.test.ts
 *
 * End-to-end tests for grpcUnary and grpcStream against a local in-process
 * gRPC server.  Uses grpc.Server with identity (pass-through) serializers so
 * raw protobuf bytes flow straight through, same as the engine does.
 *
 * Run individually: node --experimental-strip-types --test src/main/api-toolkit/grpc-engine.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as grpc from '@grpc/grpc-js'
import protobuf from 'protobufjs'
import { grpcUnary, grpcStream } from './grpc-engine.ts'
import type { GrpcRequest } from '../../shared/api-toolkit-contracts.ts'

// ─── Shared proto definition ─────────────────────────────────────────────────

const PROTO_TEXT = `
syntax = "proto3";
package test;
service TestService {
  rpc Hello (HelloRequest)            returns (HelloResponse);
  rpc ServerStream (HelloRequest)     returns (stream HelloResponse);
}
message HelloRequest  { string name     = 1; }
message HelloResponse { string greeting = 1; }
`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(port: number, serviceMethod: string, messageJson: string): GrpcRequest {
  return {
    endpoint: `127.0.0.1:${port}`,
    serviceMethod,
    messageJson,
    metadata: [],
    tls: { mode: 'none' },
    protoSource: { type: 'text', content: PROTO_TEXT },
  }
}

/** Spin up an in-process gRPC server bound to a random OS port. */
async function startServer(): Promise<{ port: number; server: grpc.Server }> {
  return new Promise((resolve, reject) => {
    const parseResult = protobuf.parse(PROTO_TEXT)
    const root = parseResult.root
    root.resolveAll()
    const HelloRequest = root.lookupType('test.HelloRequest')
    const HelloResponse = root.lookupType('test.HelloResponse')

    // Identity serializers: raw protobuf bytes in → raw protobuf bytes out.
    const ident = (b: Buffer): Buffer => b

    const serviceDefinition = {
      hello: {
        path: '/test.TestService/Hello',
        requestStream: false,
        responseStream: false,
        requestSerialize: ident,
        requestDeserialize: ident,
        responseSerialize: ident,
        responseDeserialize: ident,
      },
      serverStream: {
        path: '/test.TestService/ServerStream',
        requestStream: false,
        responseStream: true,
        requestSerialize: ident,
        requestDeserialize: ident,
        responseSerialize: ident,
        responseDeserialize: ident,
      },
    } as unknown as grpc.ServiceDefinition

    const impl: grpc.UntypedServiceImplementation = {
      hello(
        call: grpc.ServerUnaryCall<Buffer, Buffer>,
        callback: grpc.sendUnaryData<Buffer>,
      ) {
        const req = HelloRequest.decode(call.request)
        const name = String((req as unknown as Record<string, unknown>).name ?? '')
        const respBytes = Buffer.from(
          HelloResponse.encode(HelloResponse.create({ greeting: `hello ${name}` })).finish(),
        )
        callback(null, respBytes)
      },

      serverStream(call: grpc.ServerWritableStream<Buffer, Buffer>) {
        const req = HelloRequest.decode(call.request)
        const name = String((req as unknown as Record<string, unknown>).name ?? '')
        const respBytes = Buffer.from(
          HelloResponse.encode(HelloResponse.create({ greeting: `stream:${name}` })).finish(),
        )
        call.write(respBytes)
        call.end()
      },
    }

    const server = new grpc.Server()
    server.addService(serviceDefinition, impl)
    server.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) return reject(err)
        resolve({ port, server })
      },
    )
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('grpcUnary: calls Hello and gets back the greeting', async () => {
  const { port, server } = await startServer()
  try {
    const req = makeReq(port, 'test.TestService/Hello', '{"name":"world"}')
    const resp = await grpcUnary(req)
    assert.equal(resp.status.code, 0, `expected OK, got ${resp.status.codeName}: ${resp.status.details}`)
    assert.equal(resp.messages.length, 1)
    const parsed = JSON.parse(resp.messages[0].json) as { greeting: string }
    assert.equal(parsed.greeting, 'hello world')
  } finally {
    await new Promise<void>((resolve) => server.tryShutdown(() => resolve()))
  }
})

test('grpcStream: server-streaming calls onMessage and onEnd', async () => {
  const { port, server } = await startServer()
  try {
    const req = makeReq(port, 'test.TestService/ServerStream', '{"name":"stream"}')
    const messages: string[] = []
    await new Promise<void>((resolve, reject) => {
      grpcStream(req, {
        onMessage: (msg) => messages.push(msg.json),
        onEnd: (status) => {
          if (status.code !== 0) {
            reject(new Error(`stream ended with ${status.codeName}: ${status.details}`))
          } else {
            resolve()
          }
        },
        onError: (err) => reject(new Error(err)),
      }).catch(reject)
    })
    assert.equal(messages.length, 1)
    const parsed = JSON.parse(messages[0]) as { greeting: string }
    assert.equal(parsed.greeting, 'stream:stream')
  } finally {
    await new Promise<void>((resolve) => server.tryShutdown(() => resolve()))
  }
})
