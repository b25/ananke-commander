import { net, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { resolvePathUnderRendererRoot } from './appProtocolPaths.js'

const SCHEME = 'app'

const ASSET_EXTENSIONS = new Set([
  '.js', '.mjs', '.css', '.json', '.svg', '.png', '.ico', '.woff', '.woff2',
  '.ttf', '.otf', '.webp', '.gif', '.jpg', '.jpeg', '.map', '.wasm'
])

export function registerPrivilegedAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.wasm': 'application/wasm',
    '.map': 'application/json'
  }
  return map[ext] ?? 'application/octet-stream'
}

function wantsHtmlSpaFallback(request: Request, pathname: string): boolean {
  const ext = extname(pathname).toLowerCase()
  if (ext && ASSET_EXTENSIONS.has(ext)) return false
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html') || accept.includes('*/*')
}

export async function handleAppProtocolRequest(
  request: Request,
  rendererDir: string,
  devServerUrl: string | undefined
): Promise<Response> {
  const url = new URL(request.url)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '' || pathname === '/') pathname = '/index.html'

  if (devServerUrl) {
    const target = new URL(pathname + url.search, devServerUrl).toString()
    try {
      return await net.fetch(target, { bypassCustomProtocolHandlers: true })
    } catch {
      // ignore
    }
  }

  const filePath = resolvePathUnderRendererRoot(url.pathname, rendererDir)
  if (!filePath) {
    return new Response('Not Found', { status: 404 })
  }

  try {
    const data = await readFile(filePath)
    return new Response(data, {
      headers: { 'Content-Type': mimeForPath(filePath) }
    })
  } catch {
    if (pathname !== '/index.html' && wantsHtmlSpaFallback(request, pathname)) {
      const indexPath = join(resolve(rendererDir), 'index.html')
      try {
        const html = await readFile(indexPath)
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    }
    return new Response('Not Found', { status: 404 })
  }
}

export async function registerAppProtocolHandler(rendererDir: string): Promise<void> {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL

  await protocol.handle(SCHEME, (request) =>
    handleAppProtocolRequest(request, rendererDir, devServerUrl)
  )
}

export function appOrigin(): string {
  return `${SCHEME}://ananke-commander`
}

export function appEntryUrl(): string {
  return `${appOrigin()}/`
}
