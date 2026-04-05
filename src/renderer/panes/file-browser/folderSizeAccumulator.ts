// This file runs in a Web Worker context (renderer-side).
// It receives IPC stream events forwarded from the useFolderSize hook,
// accumulates totals, and posts back throttled updates to prevent
// rapid React re-renders.
//
// Incoming messages:
//   { type: 'progress', requestId, partialSize, filesScanned }
//   { type: 'done', requestId, totalSize }
//   { type: 'error', requestId, message }
//   { type: 'reset' }
//
// Outgoing messages:
//   { type: 'update', requestId, currentSize, filesScanned, status: 'streaming' | 'done' | 'error' }

const state = new Map<string, { size: number; files: number; lastPosted: number }>()
const THROTTLE_MS = 100

self.onmessage = (e: MessageEvent) => {
  const msg = e.data

  if (msg.type === 'progress') {
    const { requestId, partialSize, filesScanned } = msg
    const existing = state.get(requestId) || { size: 0, files: 0, lastPosted: 0 }
    existing.size = partialSize // partialSize is cumulative from worker
    existing.files = filesScanned
    state.set(requestId, existing)

    const now = Date.now()
    if (now - existing.lastPosted >= THROTTLE_MS) {
      existing.lastPosted = now
      self.postMessage({
        type: 'update',
        requestId,
        currentSize: existing.size,
        filesScanned: existing.files,
        status: 'streaming'
      })
    }
  } else if (msg.type === 'done') {
    const { requestId, totalSize } = msg
    state.delete(requestId)
    self.postMessage({
      type: 'update',
      requestId,
      currentSize: totalSize,
      filesScanned: 0,
      status: 'done'
    })
  } else if (msg.type === 'error') {
    const { requestId } = msg
    state.delete(requestId)
    self.postMessage({
      type: 'update',
      requestId,
      currentSize: 0,
      filesScanned: 0,
      status: 'error'
    })
  } else if (msg.type === 'reset') {
    state.clear()
  }
}
