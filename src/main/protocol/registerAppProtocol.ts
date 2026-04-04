import { app, net, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCHEME = 'app'

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
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  }
  return map[ext] ?? 'application/octet-stream'
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

  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = join(rendererDir, safe)

  try {
    const data = await readFile(filePath)
    return new Response(data, {
      headers: { 'Content-Type': mimeForPath(filePath) }
    })
  } catch {
    if (pathname !== '/index.html') {
      const indexPath = join(rendererDir, 'index.html')
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
