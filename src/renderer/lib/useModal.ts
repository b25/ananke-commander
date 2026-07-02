import { useEffect } from 'react'

/**
 * Dispatch `ananke:modal-open` on mount and `ananke:modal-close` on unmount.
 *
 * Native `WebContentsView` browser panes are rendered at the OS compositor
 * layer — above all CSS z-index — so any modal that mounts must move them
 * off-screen to stay visible. `BrowserPlaceholderPane` listens for these
 * events and calls `window.ananke.browser.suspend()` / `scheduleSync()`
 * accordingly. Use this hook in every component that renders `.modal-backdrop`.
 */
export function useModal(): void {
  useEffect(() => {
    window.dispatchEvent(new Event('ananke:modal-open'))
    return () => {
      window.dispatchEvent(new Event('ananke:modal-close'))
    }
  }, [])
}
