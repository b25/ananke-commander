import { useEffect, useRef, useState } from 'react'

export interface RadarNode {
  name: string
  path: string
  size: number
  children?: RadarNode[]
  isDirectory: boolean
}

// ── Shared listener pool ─────────────────────────────────────────────────────
// One pair of IPC listeners for the whole app; routes by requestId.
// This avoids exceeding Node's default maxListeners (10) when many concurrent
// folder-size requests are in flight.

const pending = new Map<string, (size: number) => void>()
let unsubDone: (() => void) | null = null
let unsubErr: (() => void) | null = null

function ensureListeners() {
  if (unsubDone) return
  unsubDone = window.ananke.fs.onFolderSizeDone((msg) => {
    const cb = pending.get(msg.requestId)
    if (cb) { pending.delete(msg.requestId); cb(msg.totalSize) }
  })
  unsubErr = window.ananke.fs.onFolderSizeError((msg) => {
    const cb = pending.get(msg.requestId)
    if (cb) { pending.delete(msg.requestId); cb(0) }
  })
}

function maybeRelease() {
  if (pending.size === 0) {
    unsubDone?.(); unsubDone = null
    unsubErr?.();  unsubErr  = null
  }
}

async function getFolderSizeOnce(path: string): Promise<number> {
  ensureListeners()
  const requestId = await window.ananke.fs.startFolderSize(path)
  return new Promise((resolve) => {
    pending.set(requestId, (size) => { maybeRelease(); resolve(size) })
  })
}

// ── Parallel helper ──────────────────────────────────────────────────────────

async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 8
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRadarData(rootPath: string, onUpdate?: (data: RadarNode) => void) {
  const [data, setData] = useState<RadarNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState<{ truncated: boolean; total: number } | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setTruncated(null)
    setProgress({ done: 0, total: 0 })

    async function load(): Promise<RadarNode> {
      const entries = await window.ananke.fs.listDir(rootPath)
      const name = rootPath.split('/').pop() || rootPath

      const totalEntries = entries.length
      const cappedEntries = entries.slice(0, 500)
      if (totalEntries > 500) {
        setTruncated({ truncated: true, total: totalEntries })
      }

      const dirEntries = cappedEntries.filter((e) => e.isDirectory)
      const fileEntries = cappedEntries.filter((e) => !e.isDirectory)

      setProgress({ done: 0, total: dirEntries.length })

      const children: RadarNode[] = fileEntries.map((e) => ({
        name: e.name,
        path: e.path,
        size: e.size,
        isDirectory: false
      }))

      const buildPartialTree = (): RadarNode => {
        const totalSize = children.reduce((acc, c) => acc + c.size, 0)
        return { name, path: rootPath, size: totalSize, children: [...children], isDirectory: true }
      }

      let resolvedCount = 0

      await parallelMap(dirEntries, async (entry) => {
        if (cancelled) return
        const size = await getFolderSizeOnce(entry.path)
        if (cancelled) return
        children.push({ name: entry.name, path: entry.path, size, isDirectory: true })
        resolvedCount++
        setProgress({ done: resolvedCount, total: dirEntries.length })
        const partial = buildPartialTree()
        setData(partial)
        onUpdateRef.current?.(partial)
      })

      return buildPartialTree()
    }

    load()
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [rootPath])

  return { data, loading, error, truncated, progress }
}
