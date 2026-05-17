import type { Session, WebContents } from 'electron'

/** Hosts allowed inside embedded guest WebContentsView navigation. */
const TRUSTED_GUEST_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'example.com',
  'www.example.com'
])

let runtimeExtraHosts = new Set<string>()

/** User-configured hosts (from settings) merged at runtime. */
export function setGuestAllowedHosts(hosts: readonly string[]): void {
  runtimeExtraHosts = new Set()
  for (const raw of hosts) {
    const h = parseAllowlistHost(raw)
    if (h) runtimeExtraHosts.add(h)
  }
}

export function parseAllowlistHost(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    let check = t
    if (!/^https?:\/\//i.test(check) && !check.includes('://')) {
      check = `https://${check.split('/')[0]}`
    }
    const u = new URL(check)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return normalizedHostname(u.hostname)
  } catch {
    const bare = t.split('/')[0]?.split(':')[0] ?? ''
    if (!bare || !/^[a-z0-9.*_-]+$/i.test(bare)) return null
    return normalizedHostname(bare)
  }
}

function isHostAllowed(hostname: string): boolean {
  const h = normalizedHostname(hostname)
  return TRUSTED_GUEST_HOSTS.has(h) || runtimeExtraHosts.has(h)
}

function normalizedHostname(hostname: string): string {
  let h = hostname.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  try {
    if (typeof URL !== 'undefined' && 'toASCII' in URL) {
      return (URL as typeof URL & { toASCII: (h: string) => string }).toASCII(h)
    }
  } catch {
    // fall through
  }
  return h
}

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

/** Embedded browser pane: strict host allowlist. */
export function isNavigationAllowed(url: string): boolean {
  const u = parseHttpUrl(url)
  if (!u) return false
  if (u.protocol === 'about:') return u.href === 'about:blank' || u.href === 'about:blank/'
  if (u.protocol === 'data:') return false
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  return isHostAllowed(u.hostname)
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
