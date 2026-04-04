import type { Session, WebContents } from 'electron'

const TRUSTED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'example.com',
  'www.example.com'
])

export function isNavigationAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'about:' || u.protocol === 'data:') return true
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return TRUSTED_HOSTS.has(u.hostname)
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
