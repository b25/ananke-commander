/**
 * Fire a toast notification. The top-level App listens for `ananke:toast`
 * and displays it via the existing `app-error-banner` surface.
 *
 * tones:
 *   'error'  — red banner (default) — for operation failures
 *   'warn'   — amber banner         — for non-fatal warnings
 *   'info'   — blue/accent banner   — for success / informational messages
 *
 * Works from any renderer context (React components, plain TS modules) because
 * it only dispatches a CustomEvent on `window`.
 */
export function showToast(message: string, tone: 'error' | 'warn' | 'info' = 'error'): void {
  window.dispatchEvent(
    new CustomEvent('ananke:toast', { detail: { message, tone } })
  )
}
