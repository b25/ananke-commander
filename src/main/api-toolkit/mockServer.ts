import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import type { MockRoute } from '../../shared/api-toolkit-contracts.js'

type HitCallback = (routeId: string, hitCount: number) => void

function matchPattern(pattern: string, reqPath: string): boolean {
  // Strip query string
  const path = reqPath.split('?')[0]
  if (!pattern.includes('*')) return pattern === path
  // ** → .*, * → [^/]*
  const re = new RegExp(
    '^' + pattern.replace(/\*\*/g, '\x00').replace(/\*/g, '[^/]*').replace(/\x00/g, '.*') + '$'
  )
  return re.test(path)
}

class MockServer {
  private server: Server | null = null
  private routes: MockRoute[] = []
  private hitCounts: Map<string, number> = new Map()
  private onHit: HitCallback | null = null

  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  updateRoutes(routes: MockRoute[]): void {
    this.routes = routes
    // Preserve in-memory hit counts
    for (const r of routes) {
      if (!this.hitCounts.has(r.id)) {
        this.hitCounts.set(r.id, r.hitCount)
      }
    }
  }

  start(port: number, routes: MockRoute[], onHit: HitCallback): Promise<number> {
    if (this.server) {
      return Promise.resolve(this.getActualPort())
    }
    this.routes = routes
    this.onHit = onHit
    this.hitCounts = new Map(routes.map((r) => [r.id, r.hitCount]))

    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handleRequest(req, res))

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`))
        } else {
          reject(err)
        }
      })

      server.listen(port, '127.0.0.1', () => {
        this.server = server
        resolve(this.getActualPort())
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        this.server = null
        this.onHit = null
        resolve()
      })
    })
  }

  private getActualPort(): number {
    const addr = this.server?.address()
    return typeof addr === 'object' && addr !== null ? addr.port : 0
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const method = (req.method ?? 'GET').toUpperCase()
    const url = req.url ?? '/'

    // Handle CORS preflight automatically when no explicit OPTIONS route matches
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }

    const enabled = this.routes.filter((r) => r.enabled)
    const match = enabled.find((r) => {
      const methodOk = r.method === '*' || r.method.toUpperCase() === method
      return methodOk && matchPattern(r.urlPattern, url)
    })

    if (!match) {
      if (method === 'OPTIONS') {
        res.writeHead(204, corsHeaders)
        res.end()
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ error: 'No mock route matched' }))
      }
      return
    }

    const respond = () => {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        ...match.responseHeaders,
      }
      if (match.responseBody && !headers['content-type'] && !headers['Content-Type']) {
        const looksLikeJson =
          match.responseBody.trimStart().startsWith('{') ||
          match.responseBody.trimStart().startsWith('[')
        headers['Content-Type'] = looksLikeJson ? 'application/json' : 'text/plain'
      }
      res.writeHead(match.statusCode, headers)
      res.end(match.responseBody)

      // Update hit count
      const prev = this.hitCounts.get(match.id) ?? 0
      const next = prev + 1
      this.hitCounts.set(match.id, next)
      this.onHit?.(match.id, next)
    }

    if (match.delay > 0) {
      setTimeout(respond, match.delay)
    } else {
      respond()
    }
  }
}

// Singleton
export const mockServer = new MockServer()
