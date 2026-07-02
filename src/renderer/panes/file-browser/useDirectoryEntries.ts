import { useCallback, useEffect, useState } from 'react'
import type { FileBrowserPaneState, ListDirEntry } from '../../../shared/contracts'
import { showToast } from '../../components/useToast'

/**
 * Owns the two directory listings for a file-browser pane (left/right) and the refresh helpers.
 * Reloads whenever the corresponding path changes. Extracted from FileBrowserPane so the pane
 * itself is left with orchestration rather than I/O plumbing.
 *
 * On listDir failure the stale entries are CLEARED (set to []) and an error string is returned
 * so the consuming pane can render an inline "Cannot read directory" state instead of showing
 * misleading rows from the previous path.
 */
export function useDirectoryEntries(pane: FileBrowserPaneState) {
  const [leftEntries, setLeftEntries] = useState<ListDirEntry[]>([])
  const [rightEntries, setRightEntries] = useState<ListDirEntry[]>([])
  const [leftError, setLeftError] = useState<string | null>(null)
  const [rightError, setRightError] = useState<string | null>(null)

  const refreshDir = useCallback(async (dir: string) => {
    return window.ananke.fs.listDir(dir)
  }, [])

  useEffect(() => {
    void refreshDir(pane.leftPath).then((entries) => {
      setLeftEntries(entries)
      setLeftError(null)
    }).catch((e) => {
      console.warn("useDirectoryEntries: listDir failed", e)
      setLeftEntries([])
      const msg = e instanceof Error ? e.message : String(e)
      setLeftError(msg)
      showToast(`Cannot read directory: ${msg}`)
    })
  }, [pane.leftPath, refreshDir])

  useEffect(() => {
    void refreshDir(pane.rightPath).then((entries) => {
      setRightEntries(entries)
      setRightError(null)
    }).catch((e) => {
      console.warn("useDirectoryEntries: listDir failed", e)
      setRightEntries([])
      const msg = e instanceof Error ? e.message : String(e)
      setRightError(msg)
      showToast(`Cannot read directory: ${msg}`)
    })
  }, [pane.rightPath, refreshDir])

  const refreshBoth = useCallback(() => {
    void refreshDir(pane.leftPath).then((entries) => {
      setLeftEntries(entries)
      setLeftError(null)
    }).catch((e) => {
      console.warn("useDirectoryEntries: listDir failed", e)
      setLeftEntries([])
      const msg = e instanceof Error ? e.message : String(e)
      setLeftError(msg)
      showToast(`Cannot read directory: ${msg}`)
    })
    void refreshDir(pane.rightPath).then((entries) => {
      setRightEntries(entries)
      setRightError(null)
    }).catch((e) => {
      console.warn("useDirectoryEntries: listDir failed", e)
      setRightEntries([])
      const msg = e instanceof Error ? e.message : String(e)
      setRightError(msg)
      showToast(`Cannot read directory: ${msg}`)
    })
  }, [pane.leftPath, pane.rightPath, refreshDir])

  const refreshActive = useCallback(() => {
    if (pane.focusedSide === 'left') {
      void refreshDir(pane.leftPath).then((entries) => {
        setLeftEntries(entries)
        setLeftError(null)
      }).catch((e) => {
        console.warn("useDirectoryEntries: listDir failed", e)
        setLeftEntries([])
        const msg = e instanceof Error ? e.message : String(e)
        setLeftError(msg)
        showToast(`Cannot read directory: ${msg}`)
      })
    } else {
      void refreshDir(pane.rightPath).then((entries) => {
        setRightEntries(entries)
        setRightError(null)
      }).catch((e) => {
        console.warn("useDirectoryEntries: listDir failed", e)
        setRightEntries([])
        const msg = e instanceof Error ? e.message : String(e)
        setRightError(msg)
        showToast(`Cannot read directory: ${msg}`)
      })
    }
  }, [pane.focusedSide, pane.leftPath, pane.rightPath, refreshDir])

  return { leftEntries, rightEntries, leftError, rightError, refreshBoth, refreshActive }
}
