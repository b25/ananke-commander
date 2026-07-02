import type { HttpRequest } from '../../shared/api-toolkit-contracts.js'

// ─── Shell quoting ────────────────────────────────────────────────────────────

/** Wrap `s` in POSIX single quotes, escaping any embedded single quotes. */
function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// ─── cURL export ─────────────────────────────────────────────────────────────

export function toCurl(req: HttpRequest): string {
  const parts: string[] = ['curl']

  // Method (omit -X GET for brevity)
  if (req.method !== 'GET') parts.push(`-X ${req.method}`)

  // Build URL with query params
  const enabledParams = req.params.filter((p) => p.enabled && p.key.trim())
  let url = req.url
  if (req.auth.type === 'apiKey' && req.auth.in === 'query' && req.auth.key.trim()) {
    enabledParams.push({ key: req.auth.key, value: req.auth.value, enabled: true })
  }
  if (enabledParams.length > 0) {
    const sep = url.includes('?') ? '&' : '?'
    url += sep + enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  }
  parts.push(shq(url))

  // Auth headers
  if (req.auth.type === 'basic') {
    parts.push(`-u ${shq(`${req.auth.username}:${req.auth.password}`)}`)
  } else if (req.auth.type === 'bearer') {
    parts.push(`-H ${shq(`Authorization: Bearer ${req.auth.token}`)}`)
  } else if (req.auth.type === 'apiKey' && req.auth.in === 'header') {
    parts.push(`-H ${shq(`${req.auth.key}: ${req.auth.value}`)}`)
  }

  // User-defined headers
  for (const h of req.headers) {
    if (h.enabled && h.key.trim()) {
      parts.push(`-H ${shq(`${h.key}: ${h.value}`)}`)
    }
  }

  // Body
  if (req.body.mode !== 'none' && req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body.mode === 'raw' || req.body.mode === 'json') {
      parts.push(`-d ${shq(req.body.raw ?? '')}`)
    } else if (req.body.mode === 'urlencoded') {
      const encoded = (req.body.formFields ?? [])
        .filter((f) => f.enabled)
        .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
        .join('&')
      parts.push(`--data-urlencode ${shq(encoded)}`)
    } else if (req.body.mode === 'form') {
      for (const f of req.body.formFields ?? []) {
        if (f.enabled) parts.push(`-F ${shq(`${f.key}=${f.value}`)}`)
      }
    } else if (req.body.mode === 'binary') {
      if (req.body.filePath) {
        parts.push(`--data-binary @${shq(req.body.filePath)}`)
      }
    } else if (req.body.mode === 'multipart') {
      for (const p of req.body.parts ?? []) {
        if (!p.enabled) continue
        if (p.kind === 'text') {
          parts.push(`-F ${shq(`${p.key}=${p.value}`)}`)
        } else {
          parts.push(`-F ${shq(`${p.key}=@${p.filePath}`)}`)
        }
      }
    }
  }

  return parts.join(' \\\n  ')
}

// ─── cURL import ─────────────────────────────────────────────────────────────

export function fromCurl(curlStr: string): HttpRequest {
  // Normalise: collapse line continuations, trim
  const flat = curlStr.replace(/\\\n\s*/g, ' ').trim()

  // Tokenise respecting single/double quotes
  const tokens = tokenise(flat)
  if (tokens[0]?.toLowerCase() !== 'curl') throw new Error('Not a curl command')

  let method = 'GET'
  let url = ''
  const headers: { key: string; value: string; enabled: boolean }[] = []
  const formFields: { key: string; value: string; enabled: boolean }[] = []
  const multipartParts: Array<{ key: string; kind: 'text'; value: string; enabled: boolean } | { key: string; kind: 'file'; filePath: string; enabled: boolean }> = []
  let bodyRaw = ''
  let binaryFilePath = ''
  let bodyMode: HttpRequest['body']['mode'] = 'none'
  let hasFilePart = false
  let user = ''

  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]

    if (tok === '-X' || tok === '--request') {
      method = tokens[++i] ?? method
    } else if (tok === '-H' || tok === '--header') {
      const hdr = tokens[++i] ?? ''
      const colon = hdr.indexOf(':')
      if (colon > 0) {
        headers.push({ key: hdr.slice(0, colon).trim(), value: hdr.slice(colon + 1).trim(), enabled: true })
      }
    } else if (tok === '-d' || tok === '--data' || tok === '--data-raw') {
      bodyRaw = tokens[++i] ?? ''
      bodyMode = 'raw'
      if (bodyRaw.trimStart().startsWith('{') || bodyRaw.trimStart().startsWith('[')) bodyMode = 'json'
    } else if (tok === '--data-binary') {
      const val = tokens[++i] ?? ''
      if (val.startsWith('@')) {
        binaryFilePath = val.slice(1)
        bodyMode = 'binary'
      } else {
        bodyRaw = val
        bodyMode = 'raw'
        if (bodyRaw.trimStart().startsWith('{') || bodyRaw.trimStart().startsWith('[')) bodyMode = 'json'
      }
    } else if (tok === '--data-urlencode') {
      const raw = tokens[++i] ?? ''
      // parse key=value pairs separated by &
      for (const pair of raw.split('&')) {
        const eq = pair.indexOf('=')
        if (eq >= 0) formFields.push({ key: decodeURIComponent(pair.slice(0, eq)), value: decodeURIComponent(pair.slice(eq + 1)), enabled: true })
      }
      bodyMode = 'urlencoded'
    } else if (tok === '-F' || tok === '--form') {
      const kv = tokens[++i] ?? ''
      const eq = kv.indexOf('=')
      if (eq >= 0) {
        const key = kv.slice(0, eq)
        const val = kv.slice(eq + 1)
        if (val.startsWith('@')) {
          multipartParts.push({ key, kind: 'file', filePath: val.slice(1), enabled: true })
          hasFilePart = true
          bodyMode = 'multipart'
        } else {
          formFields.push({ key, value: val, enabled: true })
          multipartParts.push({ key, kind: 'text', value: val, enabled: true })
          if (!hasFilePart && bodyMode !== 'multipart') bodyMode = 'form'
        }
      }
    } else if (tok === '-u' || tok === '--user') {
      user = tokens[++i] ?? ''
    } else if (tok === '-L' || tok === '--location' || tok === '--compressed' || tok === '-s' || tok === '--silent' || tok === '-v' || tok === '--verbose') {
      // flags we accept but ignore
    } else if (!tok.startsWith('-')) {
      if (!url) url = tok
    }
    i++
  }

  // If any -F had a file part, upgrade mode to multipart
  if (hasFilePart) bodyMode = 'multipart'

  // Detect method from body presence
  if (method === 'GET' && bodyMode !== 'none') method = 'POST'

  // Auth
  let auth: HttpRequest['auth'] = { type: 'none' }
  if (user) {
    const colon = user.indexOf(':')
    auth = { type: 'basic', username: colon >= 0 ? user.slice(0, colon) : user, password: colon >= 0 ? user.slice(colon + 1) : '' }
  } else {
    const authHeader = headers.find((h) => h.key.toLowerCase() === 'authorization')
    if (authHeader) {
      const v = authHeader.value
      if (v.startsWith('Bearer ')) {
        auth = { type: 'bearer', token: v.slice(7) }
        headers.splice(headers.indexOf(authHeader), 1)
      } else if (v.startsWith('Basic ')) {
        const decoded = atob(v.slice(6))
        const colon = decoded.indexOf(':')
        auth = { type: 'basic', username: colon >= 0 ? decoded.slice(0, colon) : decoded, password: colon >= 0 ? decoded.slice(colon + 1) : '' }
        headers.splice(headers.indexOf(authHeader), 1)
      }
    }
  }

  // Parse URL params
  const params: { key: string; value: string; enabled: boolean }[] = []
  let cleanUrl = url
  const qIdx = url.indexOf('?')
  if (qIdx >= 0) {
    cleanUrl = url.slice(0, qIdx)
    for (const pair of url.slice(qIdx + 1).split('&')) {
      const eq = pair.indexOf('=')
      if (eq >= 0) params.push({ key: decodeURIComponent(pair.slice(0, eq)), value: decodeURIComponent(pair.slice(eq + 1)), enabled: true })
      else if (pair) params.push({ key: decodeURIComponent(pair), value: '', enabled: true })
    }
  }

  const body: HttpRequest['body'] = bodyMode === 'none'
    ? { mode: 'none' }
    : bodyMode === 'urlencoded' || bodyMode === 'form'
      ? { mode: bodyMode, formFields }
      : bodyMode === 'binary'
        ? { mode: 'binary', filePath: binaryFilePath }
        : bodyMode === 'multipart'
          ? { mode: 'multipart', parts: multipartParts, formFields }
          : { mode: bodyMode, raw: bodyRaw }

  return {
    method: method as HttpRequest['method'],
    url: cleanUrl,
    params,
    headers,
    body,
    auth,
    timeout: 30000,
  }
}

// ─── Tokeniser ───────────────────────────────────────────────────────────────

function tokenise(str: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < str.length) {
    // skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++
    if (i >= str.length) break

    if (str[i] === "'") {
      i++
      let s = ''
      while (i < str.length && str[i] !== "'") {
        if (str[i] === '\\' && i + 1 < str.length && str[i + 1] === "'") { s += "'"; i += 2 }
        else s += str[i++]
      }
      i++ // closing quote
      tokens.push(s)
    } else if (str[i] === '"') {
      i++
      let s = ''
      while (i < str.length && str[i] !== '"') {
        if (str[i] === '\\' && i + 1 < str.length) { s += str[i + 1]; i += 2 }
        else s += str[i++]
      }
      i++
      tokens.push(s)
    } else {
      let s = ''
      while (i < str.length && !/\s/.test(str[i])) s += str[i++]
      tokens.push(s)
    }
  }
  return tokens
}
