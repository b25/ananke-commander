import { useCallback, useEffect, useRef, useState } from 'react'

export type FolderSizeState = {
  status: 'idle' | 'calculating' | 'streaming' | 'done' | 'error'
  size?: number
}

export function useFolderSize(currentPath: string) {
  const [sizes, setSizes] = useState<Record<string, FolderSizeState>>({})
  // Track active requestId -> dirPath mapping
  const activeRequests = useRef<Map<string, string>>(new Map())
  // Web Worker ref
  const workerRef = useRef<Worker | null>(null)
  // IPC cleanup functions
  const cleanupRef = useRef<Array<() => void>>([])

  // Create Web Worker on mount, set up IPC listeners
  useEffect(() => {
    const worker = new Worker(
      new URL('./folderSizeAccumulator.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    // Listen to Web Worker messages to update React state
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'update') {
        const { requestId, currentSize, status } = msg
        const dirPath = activeRequests.current.get(requestId)
        if (!dirPath) return

        setSizes((prev) => ({
          ...prev,
          [dirPath]: { status, size: currentSize }
        }))

        if (status === 'done' || status === 'error') {
          activeRequests.current.delete(requestId)
        }
      }
    }

    // Set up IPC listeners that forward to the Web Worker
    const offProgress = window.ananke.fs.onFolderSizeProgress((msg) => {
      worker.postMessage({ type: 'progress', ...msg })
    })
    const offDone = window.ananke.fs.onFolderSizeDone((msg) => {
      worker.postMessage({ type: 'done', ...msg })
    })
    const offError = window.ananke.fs.onFolderSizeError((msg) => {
      worker.postMessage({ type: 'error', ...msg })
    })

    cleanupRef.current = [offProgress, offDone, offError]

    // Cleanup on unmount
    return () => {
      // Cancel all active requests
      for (const requestId of activeRequests.current.keys()) {
        void window.ananke.fs.cancelFolderSize(requestId)
      }
      activeRequests.current.clear()
      // Remove IPC listeners
      for (const off of cleanupRef.current) off()
      cleanupRef.current = []
      // Terminate Web Worker
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // Cancel-on-navigation (D-07): when currentPath changes, cancel all active
  // requests, clear sizes state, and reset the Web Worker accumulator
  useEffect(() => {
    // Cancel all active folder size calculations
    for (const requestId of activeRequests.current.keys()) {
      void window.ananke.fs.cancelFolderSize(requestId)
    }
    activeRequests.current.clear()
    setSizes({})
    workerRef.current?.postMessage({ type: 'reset' })
  }, [currentPath])

  const startCalculation = useCallback(
    async (dirPath: string) => {
      // If already calculating/streaming, no-op (D-07)
      const existing = sizes[dirPath]
      if (existing && (existing.status === 'calculating' || existing.status === 'streaming')) {
        return
      }
      // If already done, use cached value (D-10)
      if (existing && existing.status === 'done') {
        return
      }

      // Set calculating state
      setSizes((prev) => ({
        ...prev,
        [dirPath]: { status: 'calculating' }
      }))

      // Start folder size calculation via IPC
      const requestId = await window.ananke.fs.startFolderSize(dirPath)
      activeRequests.current.set(requestId, dirPath)
    },
    [sizes]
  )

  return { sizes, startCalculation }
}
