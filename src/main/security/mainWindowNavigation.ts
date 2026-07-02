/**
 * Main-window navigation guard.
 *
 * The main BrowserWindow carries a privileged preload exposing the full ananke
 * API (fs, pty, shell). Any top-frame navigation to a remote origin would
 * inherit those capabilities. This pure function enforces an allowlist:
 *
 *  - app://   – always allowed (our custom privileged scheme)
 *  - http://localhost:5173  – allowed only during development (electron-vite
 *    dev server); blocked in packaged builds
 *  - everything else        – denied
 */

/** electron-vite default dev-server origin */
const DEV_SERVER_ORIGIN = 'http://localhost:5173'

/**
 * Returns true if the given URL is permitted as a top-frame navigation target
 * for the privileged main BrowserWindow.
 *
 * @param url   - The URL being navigated to.
 * @param isDev - Pass `!app.isPackaged` from the Electron main process.
 *                Defaults to false (deny dev-server in production).
 */
export function isMainWindowNavigationAllowed(url: string, isDev?: boolean): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false

  try {
    const u = new URL(trimmed)
    // Always allow our custom app:// scheme
    if (u.protocol === 'app:') return true
    // Allow the vite dev server only during development
    if (isDev === true && u.origin === DEV_SERVER_ORIGIN) return true
    return false
  } catch {
    return false
  }
}
