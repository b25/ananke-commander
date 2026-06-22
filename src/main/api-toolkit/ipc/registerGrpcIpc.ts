import { ipcMain } from 'electron'
import { IPC } from '../../../shared/api-toolkit-contracts.js'
import type { GrpcRequest } from '../../../shared/api-toolkit-contracts.js'
import { discoverProto, grpcUnary, grpcStream } from '../grpc-engine.js'

/** gRPC proto discovery, unary calls, and streaming (start/send/cancel). */
export function registerGrpcIpc(): void {
  ipcMain.handle(IPC.GRPC_DISCOVER, async (_e, req: GrpcRequest) => {
    try {
      return await discoverProto(req)
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.GRPC_UNARY, async (_e, req: GrpcRequest) => {
    try {
      return await grpcUnary(req)
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  const activeStreams = new Map<string, { cancel: () => void; sendMessage: (j: string) => void }>()

  ipcMain.on(IPC.GRPC_STREAM_START, async (event, streamId: string, req: GrpcRequest) => {
    const send = (channel: string, ...args: unknown[]) =>
      event.sender.send(channel, streamId, ...args)
    try {
      const handle = await grpcStream(req, {
        onMessage: (msg) => send(IPC.GRPC_STREAM_MESSAGE, msg),
        onEnd: (status, trailers) => { send(IPC.GRPC_STREAM_END, status, trailers); activeStreams.delete(streamId) },
        onError: (err) => { send(IPC.GRPC_STREAM_ERROR, err); activeStreams.delete(streamId) },
      })
      activeStreams.set(streamId, handle)
    } catch (e) {
      send(IPC.GRPC_STREAM_ERROR, String(e))
    }
  })

  ipcMain.on(IPC.GRPC_STREAM_SEND, (_e, streamId: string, jsonStr: string) =>
    activeStreams.get(streamId)?.sendMessage(jsonStr))

  ipcMain.on(IPC.GRPC_STREAM_CANCEL, (_e, streamId: string) => {
    activeStreams.get(streamId)?.cancel()
    activeStreams.delete(streamId)
  })
}
