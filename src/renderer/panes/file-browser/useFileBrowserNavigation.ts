import { useCallback, useRef, useState } from 'react'
import type { FileBrowserPaneState } from '../../../shared/contracts'

const HISTORY_MAX = 50

export function useFileBrowserNavigation(
  pane: FileBrowserPaneState,
  onUpdate: (next: FileBrowserPaneState) => void
) {
  const [leftFocusName, setLeftFocusName] = useState<string | null>(null)
  const [rightFocusName, setRightFocusName] = useState<string | null>(null)
  const leftHistoryBack = useRef<string[]>([])
  const leftHistoryFwd = useRef<string[]>([])
  const rightHistoryBack = useRef<string[]>([])
  const rightHistoryFwd = useRef<string[]>([])
  const skipHistoryPush = useRef(false)

  const navigateTo = useCallback(
    (side: 'left' | 'right', newPath: string) => {
      const oldPath = side === 'left' ? pane.leftPath : pane.rightPath
      if (oldPath === newPath) return
      if (!skipHistoryPush.current) {
        const back = side === 'left' ? leftHistoryBack : rightHistoryBack
        const fwd = side === 'left' ? leftHistoryFwd : rightHistoryFwd
        back.current.push(oldPath)
        if (back.current.length > HISTORY_MAX) back.current.shift()
        fwd.current = []
      }
      skipHistoryPush.current = false
      const normOld = oldPath.replace(/[/\\]+$/, '')
      const normNew = newPath.replace(/[/\\]+$/, '')
      const goingUp = normOld.startsWith(normNew) && normOld !== normNew
      const focusName = goingUp ? normOld.split(/[/\\]/).pop() ?? null : null
      if (side === 'left') {
        setLeftFocusName(focusName)
        onUpdate({ ...pane, focusedSide: 'left', leftPath: newPath })
      } else {
        setRightFocusName(focusName)
        onUpdate({ ...pane, focusedSide: 'right', rightPath: newPath })
      }
    },
    [pane, onUpdate]
  )

  const historyBack = useCallback(
    (focusedSide: 'left' | 'right', activePath: string) => {
      const back = focusedSide === 'left' ? leftHistoryBack : rightHistoryBack
      const fwd = focusedSide === 'left' ? leftHistoryFwd : rightHistoryFwd
      if (back.current.length === 0) return
      const prev = back.current.pop()!
      fwd.current.push(activePath)
      skipHistoryPush.current = true
      navigateTo(focusedSide, prev)
    },
    [navigateTo]
  )

  const historyForward = useCallback(
    (focusedSide: 'left' | 'right', activePath: string) => {
      const back = focusedSide === 'left' ? leftHistoryBack : rightHistoryBack
      const fwd = focusedSide === 'left' ? leftHistoryFwd : rightHistoryFwd
      if (fwd.current.length === 0) return
      const next = fwd.current.pop()!
      back.current.push(activePath)
      skipHistoryPush.current = true
      navigateTo(focusedSide, next)
    },
    [navigateTo]
  )

  return { navigateTo, historyBack, historyForward, leftFocusName, rightFocusName }
}
