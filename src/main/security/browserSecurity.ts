import type { Session, WebContents } from 'electron'

function parseHttpUrl(url: string): URL | null {
  try {
    let check = url
    if (!check.startsWith('http') && !check.startsWith('about:') && !check.startsWith('data:')) {
      check = 'https://' + check
    }
    return new URL(check)
  } catch {
    return null
  }
}

const BLOCKED_SCHEMES = /^(javascript|file|vbscript|chrome|chrome-extension):/i

/** Embedded browser pane: any http(s) URL with a hostname; blocks other schemes. */
export function isNavigationAllowed(url: string): boolean {
  const trimmed = url.trim()
  if (BLOCKED_SCHEMES.test(trimmed)) return false
  const u = parseHttpUrl(trimmed)
  if (!u) return false
  if (u.protocol === 'about:') return u.href === 'about:blank' || u.href === 'about:blank/'
  if (u.protocol === 'data:') return false
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  return Boolean(u.hostname)
}

/** System browser / openExternal: any http(s) URL the user explicitly opens. */
export function isExternalUrlAllowed(url: string): boolean {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return Boolean(u.hostname)
  } catch {
    return false
  }
}

export function hardenGuestSession(session: Session): void {
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    void permission
    callback(false)
  })
  session.setPermissionCheckHandler(() => false)
}

export function attachGuestWebContentsGuards(wc: WebContents): void {
  wc.session.setPermissionRequestHandler((_wc, permission, callback) => {
    void permission
    callback(false)
  })
  wc.on('will-navigate', (event, url) => {
    if (!isNavigationAllowed(url)) event.preventDefault()
  })
  wc.on('will-redirect', (event, url) => {
    if (!isNavigationAllowed(url)) event.preventDefault()
  })
}
