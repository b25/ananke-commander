import type { WebContents } from 'electron'

interface HarEntry {
  startedDateTime: string
  time: number
  request: {
    method: string
    url: string
    httpVersion: string
    headers: Array<{ name: string; value: string }>
    queryString: Array<{ name: string; value: string }>
    headersSize: number
    bodySize: number
  }
  response: {
    status: number
    statusText: string
    httpVersion: string
    headers: Array<{ name: string; value: string }>
    content: {
      size: number
      mimeType: string
    }
    headersSize: number
    bodySize: number
  }
  cache: Record<string, never>
  timings: {
    send: number
    wait: number
    receive: number
  }
}

interface PendingRequest {
  startTime: number
  method: string
  url: string
  headers: Array<{ name: string; value: string }>
  postData?: string
}

export class HarCapture {
  private entries: HarEntry[] = []
  private pending = new Map<string, PendingRequest>()
  private active = false
  private wc: WebContents | null = null

  get isRecording(): boolean {
    return this.active
  }

  get entryCount(): number {
    return this.entries.length
  }

  start(wc: WebContents): void {
    if (this.active) return
    this.wc = wc
    this.entries = []
    this.pending.clear()
    this.active = true

    try {
      wc.debugger.attach('1.3')
    } catch {
      // Already attached
    }

    void wc.debugger.sendCommand('Network.enable')

    wc.debugger.on('message', this.onDebuggerMessage)
  }

  stop(): void {
    if (!this.active || !this.wc) return
    this.active = false

    try {
      this.wc.debugger.off('message', this.onDebuggerMessage)
      void this.wc.debugger.sendCommand('Network.disable').catch(() => {})
      this.wc.debugger.detach()
    } catch {
      // Ignore detach errors
    }

    this.wc = null
  }

  getHar(): object {
    return {
      log: {
        version: '1.2',
        creator: {
          name: 'Ananke Commander',
          version: '0.1.0'
        },
        entries: [...this.entries]
      }
    }
  }

  clear(): void {
    this.entries = []
    this.pending.clear()
  }

  private onDebuggerMessage = (
    _event: Electron.Event,
    method: string,
    params: Record<string, unknown>
  ): void => {
    if (!this.active) return

    if (method === 'Network.requestWillBeSent') {
      const req = params as {
        requestId: string
        request: {
          method: string
          url: string
          headers: Record<string, string>
          postData?: string
        }
        timestamp: number
      }
      this.pending.set(req.requestId, {
        startTime: Date.now(),
        method: req.request.method,
        url: req.request.url,
        headers: Object.entries(req.request.headers).map(([name, value]) => ({ name, value })),
        postData: req.request.postData
      })
    }

    if (method === 'Network.responseReceived') {
      const resp = params as {
        requestId: string
        response: {
          status: number
          statusText: string
          headers: Record<string, string>
          mimeType: string
          protocol?: string
        }
      }
      const pendingReq = this.pending.get(resp.requestId)
      if (!pendingReq) return

      let queryString: Array<{ name: string; value: string }> = []
      try {
        const u = new URL(pendingReq.url)
        queryString = [...u.searchParams.entries()].map(([name, value]) => ({ name, value }))
      } catch {
        // invalid URL
      }

      const elapsed = Date.now() - pendingReq.startTime

      const entry: HarEntry = {
        startedDateTime: new Date(pendingReq.startTime).toISOString(),
        time: elapsed,
        request: {
          method: pendingReq.method,
          url: pendingReq.url,
          httpVersion: resp.response.protocol || 'HTTP/1.1',
          headers: pendingReq.headers,
          queryString,
          headersSize: -1,
          bodySize: pendingReq.postData ? pendingReq.postData.length : 0
        },
        response: {
          status: resp.response.status,
          statusText: resp.response.statusText,
          httpVersion: resp.response.protocol || 'HTTP/1.1',
          headers: Object.entries(resp.response.headers).map(([name, value]) => ({ name, value })),
          content: {
            size: -1,
            mimeType: resp.response.mimeType
          },
          headersSize: -1,
          bodySize: -1
        },
        cache: {},
        timings: {
          send: 0,
          wait: elapsed,
          receive: 0
        }
      }

      this.entries.push(entry)
      this.pending.delete(resp.requestId)
    }
  }
}
