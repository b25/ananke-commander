/**
 * Tests for RFC-correct redirect method/body rewriting (CORR-13 / Task 15)
 * and binary + multipart body modes (CORR-17).
 *
 * RFC 7231 §6.4:
 *  - 303 See Other: always switch to GET, drop body
 *  - 301/302 + POST: de-facto switch to GET, drop body
 *  - 307/308: preserve method + body
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { HttpRequest } from '../../shared/api-toolkit-contracts.ts'
import { sendHttp } from './http-client.ts'

// ─── helpers ─────────────────────────────────────────────────────────────────

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({ server, port: addr.port })
    })
  })
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let buf = ''
    req.on('data', (c: Buffer) => { buf += c.toString() })
    req.on('end', () => resolve(buf))
  })
}

const baseReq = (over: Partial<HttpRequest>): HttpRequest => ({
  method: 'GET',
  url: 'http://127.0.0.1:0/',
  params: [],
  headers: [],
  body: { mode: 'none' },
  auth: { type: 'none' },
  timeout: 5000,
  ...over,
})

// ─── 303 See Other: POST → GET, body dropped ─────────────────────────────────

test('303 redirect from POST switches to GET and drops body', async () => {
  const { server, port } = await startServer(async (req, res) => {
    if (req.url === '/post' && req.method === 'POST') {
      res.writeHead(303, { Location: '/result' })
      res.end()
    } else if (req.url === '/result' && req.method === 'GET') {
      // Verify no body was forwarded
      const body = await readBody(req)
      if (body === '') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('GET-OK')
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`UNEXPECTED-BODY:${body}`)
      }
    } else {
      // Wrong method re-issued — catch the bug
      res.writeHead(405, { 'Content-Type': 'text/plain' })
      res.end(`METHOD-NOT-ALLOWED:${req.method}`)
    }
  })

  try {
    const result = await sendHttp('test-303', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/post`,
      body: { mode: 'raw', raw: 'payload-should-be-dropped', contentType: 'text/plain' },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, 'GET-OK')
  } finally {
    await closeServer(server)
  }
})

// ─── 301 + POST: de-facto switch to GET ──────────────────────────────────────

test('301 redirect from POST switches to GET and drops body', async () => {
  const { server, port } = await startServer(async (req, res) => {
    if (req.url === '/moved' && req.method === 'POST') {
      res.writeHead(301, { Location: '/new-location' })
      res.end()
    } else if (req.url === '/new-location' && req.method === 'GET') {
      const body = await readBody(req)
      if (body === '') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('301-GET-OK')
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`UNEXPECTED-BODY:${body}`)
      }
    } else {
      res.writeHead(405)
      res.end(`METHOD-NOT-ALLOWED:${req.method}`)
    }
  })

  try {
    const result = await sendHttp('test-301', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/moved`,
      body: { mode: 'raw', raw: 'should-drop', contentType: 'text/plain' },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, '301-GET-OK')
  } finally {
    await closeServer(server)
  }
})

// ─── 302 + POST: de-facto switch to GET ──────────────────────────────────────

test('302 redirect from POST switches to GET and drops body', async () => {
  const { server, port } = await startServer(async (req, res) => {
    if (req.url === '/found' && req.method === 'POST') {
      res.writeHead(302, { Location: '/found-result' })
      res.end()
    } else if (req.url === '/found-result' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('302-GET-OK')
    } else {
      res.writeHead(405)
      res.end(`METHOD-NOT-ALLOWED:${req.method}`)
    }
  })

  try {
    const result = await sendHttp('test-302', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/found`,
      body: { mode: 'raw', raw: 'should-drop', contentType: 'text/plain' },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, '302-GET-OK')
  } finally {
    await closeServer(server)
  }
})

// ─── 307 Temporary Redirect: preserve method + body ──────────────────────────

test('307 redirect preserves POST method and body', async () => {
  const { server, port } = await startServer(async (req, res) => {
    if (req.url === '/post-307' && req.method === 'POST') {
      res.writeHead(307, { Location: '/result-307' })
      res.end()
    } else if (req.url === '/result-307' && req.method === 'POST') {
      const body = await readBody(req)
      if (body === 'keep-me') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('POST-OK')
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`WRONG-BODY:"${body}"`)
      }
    } else {
      res.writeHead(405)
      res.end(`METHOD-NOT-ALLOWED:${req.method}`)
    }
  })

  try {
    const result = await sendHttp('test-307', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/post-307`,
      body: { mode: 'raw', raw: 'keep-me', contentType: 'text/plain' },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, 'POST-OK')
  } finally {
    await closeServer(server)
  }
})

// ─── 308 Permanent Redirect: preserve method + body ──────────────────────────

test('308 redirect preserves POST method and body', async () => {
  const { server, port } = await startServer(async (req, res) => {
    if (req.url === '/post-308' && req.method === 'POST') {
      res.writeHead(308, { Location: '/result-308' })
      res.end()
    } else if (req.url === '/result-308' && req.method === 'POST') {
      const body = await readBody(req)
      if (body === 'preserve') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('308-POST-OK')
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`WRONG-BODY:"${body}"`)
      }
    } else {
      res.writeHead(405)
      res.end(`METHOD-NOT-ALLOWED:${req.method}`)
    }
  })

  try {
    const result = await sendHttp('test-308', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/post-308`,
      body: { mode: 'raw', raw: 'preserve', contentType: 'text/plain' },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, '308-POST-OK')
  } finally {
    await closeServer(server)
  }
})

// ─── CORR-17: binary and multipart body modes ────────────────────────────────

test('binary mode reads file bytes and sends them to server', async () => {
  const content = 'hello binary world'
  const tmpPath = join(tmpdir(), `ananke-test-binary-${Date.now()}.bin`)
  await writeFile(tmpPath, content, 'utf8')

  const { server, port } = await startServer(async (req, res) => {
    const body = await readBody(req)
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(body)
  })

  try {
    const result = await sendHttp('test-binary', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/`,
      body: { mode: 'binary', filePath: tmpPath },
    }))
    assert.equal(result.status, 200, `Expected 200 but got ${result.status}: ${result.body}`)
    assert.equal(result.body, content)
  } finally {
    await closeServer(server)
    await unlink(tmpPath).catch(() => {})
  }
})

test('binary mode with no filePath sends null body (no crash)', async () => {
  const { server, port } = await startServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  try {
    const result = await sendHttp('test-binary-no-path', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/`,
      body: { mode: 'binary' },
    }))
    assert.equal(result.status, 200)
  } finally {
    await closeServer(server)
  }
})

test('multipart mode sends text and file parts as multipart/form-data', async () => {
  const fileContent = 'file-data-here'
  const tmpPath = join(tmpdir(), `ananke-test-multipart-${Date.now()}.txt`)
  await writeFile(tmpPath, fileContent, 'utf8')

  let receivedContentType = ''
  let receivedBody = ''

  const { server, port } = await startServer(async (req, res) => {
    receivedContentType = req.headers['content-type'] ?? ''
    receivedBody = await readBody(req)
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  try {
    const result = await sendHttp('test-multipart', baseReq({
      method: 'POST',
      url: `http://127.0.0.1:${port}/`,
      body: {
        mode: 'multipart',
        parts: [
          { key: 'username', kind: 'text', value: 'alice', enabled: true },
          { key: 'upload', kind: 'file', filePath: tmpPath, enabled: true },
          { key: 'disabled', kind: 'text', value: 'skip', enabled: false },
        ],
      },
    }))
    assert.equal(result.status, 200)
    assert.ok(
      receivedContentType.includes('multipart/form-data'),
      `Expected multipart/form-data content-type, got: ${receivedContentType}`
    )
    assert.ok(receivedBody.includes('alice'), `Expected field value in body, got: ${receivedBody}`)
    assert.ok(receivedBody.includes(fileContent), `Expected file content in body, got: ${receivedBody}`)
    assert.ok(!receivedBody.includes('skip'), `Disabled part should be omitted, got: ${receivedBody}`)
  } finally {
    await closeServer(server)
    await unlink(tmpPath).catch(() => {})
  }
})

// ─── redirect cap is still enforced ──────────────────────────────────────────

test('redirect cap is enforced (returns last redirect response after limit)', async () => {
  let redirectCount = 0
  const { server, port } = await startServer((_req, res) => {
    redirectCount++
    res.writeHead(302, { Location: '/loop' })
    res.end()
  })

  try {
    const result = await sendHttp('test-cap', baseReq({
      method: 'GET',
      url: `http://127.0.0.1:${port}/loop`,
    }))
    // Should return the final redirect response, not loop forever
    assert.ok(result.status >= 300 && result.status < 400, `Expected a redirect status, got ${result.status}`)
    assert.ok(redirectCount <= 7, `Too many redirect hops: ${redirectCount}`) // maxRedirects=5 + initial = 6 max fetches
  } finally {
    await closeServer(server)
  }
})
