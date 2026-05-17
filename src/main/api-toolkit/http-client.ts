import { fetch as undiciFetch, type RequestInit, type Response } from 'undici'
import { randomBytes } from 'node:crypto'
import type { HttpRequest, HttpResponse, AuthConfig, KeyValue } from '../../shared/api-toolkit-contracts.js'

const activeFetches = new Map<string, AbortController>()
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024 // 10 MB safety cap
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key'])

function buildHeaders(req: HttpRequest): Record<string, string> {
  const out: Record<string, string> = {}

  for (const kv of req.headers) {
    if (kv.enabled && kv.key.trim()) out[kv.key.trim()] = kv.value
  }

  applyAuth(req.auth, out)

  if (req.body.mode !== 'none' && !out['content-type'] && !out['Content-Type']) {
    if (req.body.mode === 'json') out['Content-Type'] = 'application/json'
    else if (req.body.mode === 'raw' && req.body.contentType) out['Content-Type'] = req.body.contentType
    else if (req.body.mode === 'form') out['Content-Type'] = 'application/x-www-form-urlencoded'
    else if (req.body.mode === 'binary') out['Content-Type'] = 'application/octet-stream'
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

  if (req.auth.type === 'apiKey' && req.auth.in === 'query' && req.auth.key.trim()) {
    enabledParams.push({ key: req.auth.key, value: req.auth.value, enabled: true })
  }

  if (enabledParams.length === 0) return req.url

  const base = req.url.includes('?') ? req.url : req.url + '?'
  const search = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  const sep = base.endsWith('?') ? '' : '&'
  return base + sep + search
}

function urlSearchParamsFromFields(fields: KeyValue[] | undefined): URLSearchParams {
  const params = new URLSearchParams()
  for (const kv of fields ?? []) {
    if (kv.enabled) params.append(kv.key, kv.value)
  }
  return params
}

function buildMultipartBody(fields: KeyValue[]): { body: string; contentType: string } {
  const boundary = `----ananke-${randomBytes(16).toString('hex')}`
  const lines: string[] = []
  for (const kv of fields) {
    if (!kv.enabled) continue
    lines.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="${kv.key.replace(/"/g, '\\"')}"\r\n\r\n`,
      `${kv.value}\r\n`
    )
  }
  lines.push(`--${boundary}--\r\n`)
  return {
    body: lines.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

function buildBody(req: HttpRequest): { body: string | URLSearchParams | Buffer | null; contentType?: string } {
  switch (req.body.mode) {
    case 'none':
      return { body: null }
    case 'raw':
    case 'json':
      return { body: req.body.raw ?? null }
    case 'binary':
      return { body: req.body.raw != null ? Buffer.from(req.body.raw, 'utf8') : null }
    case 'urlencoded':
      return { body: urlSearchParamsFromFields(req.body.formFields) }
    case 'form':
      return { body: urlSearchParamsFromFields(req.body.formFields) }
    case 'multipart': {
      const { body, contentType } = buildMultipartBody(req.body.formFields ?? [])
      return { body, contentType }
    }
    default:
      return { body: req.body.raw ?? null }
  }
}

function charsetFromContentType(contentType?: string): string {
  if (!contentType) return 'utf-8'
  const m = /charset=([^;\s]+)/i.exec(contentType)
  return m?.[1]?.trim().replace(/^"|"$/g, '') || 'utf-8'
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const reader = response.body?.getReader()
  if (!reader) return new ArrayBuffer(0)

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Response too large (${total} bytes). Limit is ${maxBytes} bytes.`)
    }
    chunks.push(value)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers }
  for (const key of Object.keys(out)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) delete out[key]
  }
  return out
}

async function fetchWithRedirectLimit(
  url: string,
  init: RequestInit,
  headers: Record<string, string>,
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = url
  let currentHeaders = { ...headers }

  for (let i = 0; i <= maxRedirects; i++) {
    const response = await undiciFetch(currentUrl, { ...init, headers: currentHeaders })
    if (response.status < 300 || response.status >= 400) return response

    const location = response.headers.get('location')
    if (!location || i === maxRedirects) return response

    const nextUrl = new URL(location, currentUrl)
    const prev = new URL(currentUrl)
    if (nextUrl.origin !== prev.origin) {
      currentHeaders = stripSensitiveHeaders(currentHeaders)
    }
    currentUrl = nextUrl.toString()
  }

  return await undiciFetch(currentUrl, { ...init, headers: currentHeaders })
}

export async function sendHttp(
  id: string,
  req: HttpRequest
): Promise<HttpResponse> {
  const ac = new AbortController()
  activeFetches.set(id, ac)

  const timeoutMs = req.timeout > 0 ? req.timeout : 30000
  const timeoutHandle = setTimeout(() => ac.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)

  const startMs = performance.now()
  let ttfbMs: number | undefined

  try {
    const url = buildUrl(req)
    const headers = buildHeaders(req)
    const built = buildBody(req)
    if (built.contentType) {
      headers['Content-Type'] = built.contentType
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: ac.signal,
      redirect: 'manual',
    }

    if (built.body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = built.body
    }

    const response = await fetchWithRedirectLimit(url, init, headers)
    ttfbMs = performance.now() - startMs
    const contentLen = Number(response.headers.get('content-length') ?? '0')
    if (contentLen > MAX_RESPONSE_BYTES) {
      throw new Error(`Response too large (${contentLen} bytes). Limit is ${MAX_RESPONSE_BYTES} bytes.`)
    }

    const rawBody = await readBodyWithLimit(response, MAX_RESPONSE_BYTES)
    const downloadMs = performance.now() - startMs - (ttfbMs ?? 0)

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
      timings: { total: Math.round(performance.now() - startMs), ttfb: Math.round(ttfbMs ?? 0), download: Math.round(downloadMs) },
      redirects: [],
    }
  } finally {
    clearTimeout(timeoutHandle)
    activeFetches.delete(id)
  }
}

function tryDecodeBody(buf: ArrayBuffer, contentType?: string): string {
  const bytes = new Uint8Array(buf)
  if (isBinary(contentType)) {
    return `[binary data, ${bytes.length} bytes]`
  }
  const charset = charsetFromContentType(contentType)
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
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
