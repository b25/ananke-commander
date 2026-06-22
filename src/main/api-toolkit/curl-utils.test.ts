import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { HttpRequest } from '../../shared/api-toolkit-contracts.ts'
import { fromCurl, toCurl } from './curl-utils.ts'

const baseReq = (over: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  url: 'https://api.test/x',
  params: [],
  headers: [],
  body: { mode: 'none' },
  auth: { type: 'none' },
  timeout: 30000,
  ...over
})

test('toCurl omits -X for GET and appends query params', () => {
  const c = toCurl(baseReq({ params: [{ key: 'a', value: '1', enabled: true }] }))
  assert.ok(!c.includes('-X GET'))
  assert.ok(c.includes("'https://api.test/x?a=1'"))
})

test('toCurl emits method, bearer auth header, and raw body for POST', () => {
  const c = toCurl(baseReq({
    method: 'POST',
    auth: { type: 'bearer', token: 'tok' },
    body: { mode: 'json', raw: '{"x":1}' }
  }))
  assert.ok(c.includes('-X POST'))
  assert.ok(c.includes("-H 'Authorization: Bearer tok'"))
  assert.ok(c.includes(`-d '{"x":1}'`))
})

test('fromCurl parses method, url, header, and json body', () => {
  const r = fromCurl(`curl -X POST 'https://h/p' -H 'Content-Type: application/json' -d '{"a":1}'`)
  assert.equal(r.method, 'POST')
  assert.equal(r.url, 'https://h/p')
  assert.equal(r.headers.find((h) => h.key === 'Content-Type')?.value, 'application/json')
  assert.equal(r.body.mode, 'json')
  assert.equal((r.body as { raw: string }).raw, '{"a":1}')
})

test('fromCurl extracts -u into basic auth and infers POST from a body', () => {
  const r = fromCurl(`curl 'https://h/p' -u 'alice:secret' -d 'hello'`)
  assert.deepEqual(r.auth, { type: 'basic', username: 'alice', password: 'secret' })
  assert.equal(r.method, 'POST') // body present, method defaults GET -> POST
})

test('fromCurl splits query params off the url', () => {
  const r = fromCurl(`curl 'https://h/p?a=1&b=2'`)
  assert.equal(r.url, 'https://h/p')
  assert.deepEqual(r.params.map((p) => [p.key, p.value]), [['a', '1'], ['b', '2']])
})

test('fromCurl rejects non-curl input', () => {
  assert.throws(() => fromCurl('wget https://h/p'), /Not a curl command/)
})

test('toCurl -> fromCurl round-trips method, url, bearer auth, and body', () => {
  const req = baseReq({
    method: 'POST',
    url: 'https://api.test/v1/users',
    headers: [{ key: 'X-Trace', value: 'abc', enabled: true }],
    auth: { type: 'bearer', token: 'jwt-123' },
    body: { mode: 'json', raw: '{"name":"ada"}' }
  })
  const back = fromCurl(toCurl(req))
  assert.equal(back.method, 'POST')
  assert.equal(back.url, 'https://api.test/v1/users')
  assert.deepEqual(back.auth, { type: 'bearer', token: 'jwt-123' })
  assert.equal((back.body as { raw: string }).raw, '{"name":"ada"}')
  assert.equal(back.headers.find((h) => h.key === 'X-Trace')?.value, 'abc')
})
