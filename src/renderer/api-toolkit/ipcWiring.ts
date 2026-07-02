/**
 * Module-level singleton for global IPC event subscriptions.
 *
 * All four IPC channels (gRPC stream message/end/error + mock route-hit) must be
 * subscribed EXACTLY ONCE regardless of how many API-toolkit panes are mounted.
 * Subscribing per-mount causes double (or N×) dispatch: every stream message is
 * appended N times, every stream-end adds N history entries, etc.
 *
 * Because the handlers dispatch exclusively into the singleton zustand store via
 * `useStore.getState()`, a single subscription is sufficient — every mounted pane
 * re-renders from the shared store automatically.
 *
 * Call `ensureIpcWired()` once from the AppInner module (outside the component).
 * The guard makes it safe to call multiple times (e.g. from tests or hot-reload).
 */

import { useStore } from './store'

let wired = false

export function ensureIpcWired(): void {
  if (wired) return
  wired = true

  window.ananke.apiToolkit.mock.onRouteHit((routeId, hitCount) => {
    useStore.getState().updateRouteHitCount(routeId, hitCount)
  })

  window.ananke.apiToolkit.grpc.onStreamMessage((streamId, msg) => {
    useStore.getState().addGrpcStreamMessage(streamId, msg)
  })

  window.ananke.apiToolkit.grpc.onStreamEnd((streamId, status, trailers) => {
    useStore.getState().endGrpcStream(streamId, status, trailers)
    // Persist to history (in-memory + durable storage)
    const tab = useStore.getState().tabs.find((t) => t.id === streamId)
    if (tab) {
      const entry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        protocol: 'grpc' as const,
        name: tab.grpcRequest.serviceMethod || 'gRPC call',
        grpcRequest: tab.grpcRequest,
        grpcResponse: tab.grpcResponse ?? undefined,
        duration: 0,
      }
      useStore.getState().addHistoryEntry(entry)
      void window.ananke.apiToolkit.storage.addHistory(entry)
    }
  })

  window.ananke.apiToolkit.grpc.onStreamError((streamId, err) => {
    useStore.getState().updateTab(streamId, { error: err, loading: false, grpcStreamActive: false })
  })
}
