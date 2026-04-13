import { fetch as undiciFetch, type RequestInit, type Response } from 'undici'
import type { HttpRequest, HttpResponse, AuthConfig, KeyValue } from '../../shared/api-toolkit-contracts.js'

const activeFetches = new Map<string, AbortController>()

function buildHeaders(req: HttpRequest): Record<string, string> {
  const out: Record<string, string> = {}

  for (const kv of req.headers) {
    if (kv.enabled && kv.key.trim()) out[kv.key.trim()] = kv.value
  }

  // Auth injection
  applyAuth(req.auth, out)

  // Content-type from body
  if (req.body.mode !== 'none' && !out['content-type'] && !out['Content-Type']) {
    if (req.body.mode === 'json') out['Content-Type'] = 'application/json'
    else if (req.body.mode === 'raw' && req.body.contentType) out['Content-Type'] = req.body.contentType
    else if (req.body.mode === 'urlencoded') out['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  return out
}

function applyAuth(auth: AuthConfig, headers: Record<string, string>): void {
  switch (auth.type) {
    case 'basic': {
      const creds = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
      headers['Authorization'] = `Basic ${creds}`
      break
    }
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`
      break
    case 'apiKey':
      if (auth.in === 'header') headers[auth.key] = auth.value
      break
    case 'oauth2':
      headers['Authorization'] = `Bearer ${auth.accessToken}`
      break
  }
}

function buildUrl(req: HttpRequest): string {
  const enabledParams = req.params.filter((p) => p.enabled && p.key.trim())
  if (enabledParams.length === 0) return req.url

  const base = req.url.includes('?') ? req.url : req.url + '?'
  const search = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  const sep = base.endsWith('?') ? '' : '&'
  return base + sep + search
}

function buildBody(req: HttpRequest): string | URLSearchParams | null {
  switch (req.body.mode) {
    case 'none': return null
    case 'raw':
    case 'json': return req.body.raw ?? null
    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const kv of req.body.formFields ?? []) {
        if (kv.enabled) params.append(kv.key, kv.value)
      }
      return params
    }
    default: return req.body.raw ?? null
  }
}

export async function sendHttp(
  id: string,
  req: HttpRequest
): Promise<HttpResponse> {
  const ac = new AbortController()
  activeFetches.set(id, ac)

  const startMs = performance.now()
  let ttfbMs: number | undefined

  try {
    const url = buildUrl(req)
    const headers = buildHeaders(req)
    const body = buildBody(req)

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: ac.signal,
      redirect: 'follow',
    }

    if (body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = body
    }

    const response: Response = await undiciFetch(url, init)
    ttfbMs = performance.now() - startMs

    const rawBody = await response.arrayBuffer()
    const downloadMs = performance.now() - startMs - ttfbMs

    const respHeaders: Record<string, string> = {}
    response.headers.forEach((v, k) => { respHeaders[k] = v })

    const headerSize = Object.entries(respHeaders)
      .reduce((acc, [k, v]) => acc + k.length + v.length + 4, 0)

    const bodyText = tryDecodeBody(rawBody, respHeaders['content-type'])

    return {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
      body: bodyText,
      size: { headers: headerSize, body: rawBody.byteLength },
      timings: { total: Math.round(performance.now() - startMs), ttfb: Math.round(ttfbMs), download: Math.round(downloadMs) },
      redirects: [],
    }
  } finally {
    activeFetches.delete(id)
  }
}

function tryDecodeBody(buf: ArrayBuffer, contentType?: string): string {
  const bytes = new Uint8Array(buf)
  if (isBinary(contentType)) {
    return `[binary data, ${bytes.length} bytes]`
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function isBinary(ct?: string): boolean {
  if (!ct) return false
  const lower = ct.toLowerCase()
  return (
    lower.includes('image/') ||
    lower.includes('video/') ||
    lower.includes('audio/') ||
    lower.includes('application/octet-stream') ||
    lower.includes('application/zip') ||
    lower.includes('application/pdf')
  )
}

export function cancelHttp(id: string): void {
  activeFetches.get(id)?.abort()
  activeFetches.delete(id)
}
