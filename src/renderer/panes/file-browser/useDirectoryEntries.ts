import { useCallback, useEffect, useState } from 'react'
import type { FileBrowserPaneState, ListDirEntry } from '../../../shared/contracts'

/**
 * Owns the two directory listings for a file-browser pane (left/right) and the refresh helpers.
 * Reloads whenever the corresponding path changes. Extracted from FileBrowserPane so the pane
 * itself is left with orchestration rather than I/O plumbing.
 */
export function useDirectoryEntries(pane: FileBrowserPaneState) {
  const [leftEntries, setLeftEntries] = useState<ListDirEntry[]>([])
  const [rightEntries, setRightEntries] = useState<ListDirEntry[]>([])

  const refreshDir = useCallback(async (dir: string) => {
    return window.ananke.fs.listDir(dir)
  }, [])

  useEffect(() => {
    void refreshDir(pane.leftPath).then(setLeftEntries)
  }, [pane.leftPath, refreshDir])

  useEffect(() => {
    void refreshDir(pane.rightPath).then(setRightEntries)
  }, [pane.rightPath, refreshDir])

  const refreshBoth = useCallback(() => {
    void refreshDir(pane.leftPath).then(setLeftEntries)
    void refreshDir(pane.rightPath).then(setRightEntries)
  }, [pane.leftPath, pane.rightPath, refreshDir])

  const refreshActive = useCallback(() => {
    if (pane.focusedSide === 'left') {
      void refreshDir(pane.leftPath).then(setLeftEntries)
    } else {
      void refreshDir(pane.rightPath).then(setRightEntries)
    }
  }, [pane.focusedSide, pane.leftPath, pane.rightPath, refreshDir])

  return { leftEntries, rightEntries, refreshBoth, refreshActive }
}
