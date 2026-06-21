import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Owns the background copy/move job: status line, the active job id, and the main-process
 * progress/done/error subscription. `refreshBoth` is invoked when a job finishes so both
 * directory listings update. Extracted from FileBrowserPane.
 */
export function useFileJob(refreshBoth: () => void) {
  const [fileJobLine, setFileJobLine] = useState<string | null>(null)
  const activeJobId = useRef<string | null>(null)

  // Keep refreshBoth current without re-subscribing the IPC listeners each render.
  const refreshBothRef = useRef(refreshBoth)
  refreshBothRef.current = refreshBoth

  useEffect(() => {
    const offP = window.ananke.fileJob.onProgress((msg) => {
      if (msg.jobId !== activeJobId.current) return
      const cur = typeof msg.current === 'string' ? msg.current : ''
      const done = typeof msg.done === 'number' ? msg.done : 0
      const total = typeof msg.total === 'number' ? msg.total : 0
      setFileJobLine(total ? `${done}/${total} ${cur}` : cur || 'Working…')
    })
    const offD = window.ananke.fileJob.onDone(({ jobId: id }) => {
      if (id !== activeJobId.current) return
      activeJobId.current = null
      setFileJobLine(null)
      void refreshBothRef.current()
    })
    const offE = window.ananke.fileJob.onError(({ jobId: id, message }) => {
      if (id !== activeJobId.current) return
      activeJobId.current = null
      setFileJobLine(null)
      if (message !== 'Cancelled') alert(message)
      void refreshBothRef.current()
    })
    return () => {
      offP()
      offD()
      offE()
    }
  }, [])

  const startJob = useCallback(async (kind: 'copy' | 'move', paths: string[], destDir: string) => {
    try {
      const jobId = await window.ananke.fileJob.start(kind, paths, destDir)
      activeJobId.current = jobId
      setFileJobLine(`${kind}…`)
    } catch (e) {
      activeJobId.current = null
      setFileJobLine(null)
      alert(e instanceof Error ? e.message : String(e))
    }
  }, [])

  return { fileJobLine, setFileJobLine, startJob }
}
