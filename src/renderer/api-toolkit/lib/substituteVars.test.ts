import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GrpcRequest, HttpRequest, Variable } from '../../../shared/api-toolkit-contracts.ts'
import { applyVarsToGrpcRequest, applyVarsToHttpRequest, subStr } from './substituteVars.ts'

const v = (key: string, value: string, enabled = true): Variable => ({ key, value, isSecret: false, enabled })

test('subStr replaces {{key}} with the variable value', () => {
  assert.equal(subStr('https://{{host}}/api', [v('host', 'example.com')]), 'https://example.com/api')
})

test('subStr replaces repeated occurrences and multiple keys', () => {
  assert.equal(
    subStr('{{a}}-{{b}}-{{a}}', [v('a', '1'), v('b', '2')]),
    '1-2-1'
  )
})

test('subStr trims whitespace inside the braces', () => {
  assert.equal(subStr('{{ host }}', [v('host', 'x')]), 'x')
})

test('subStr leaves unknown keys untouched', () => {
  assert.equal(subStr('{{nope}}', [v('host', 'x')]), '{{nope}}')
})

test('subStr ignores disabled variables', () => {
  assert.equal(subStr('{{host}}', [v('host', 'x', false)]), '{{host}}')
})

test('subStr returns input unchanged for empty string or no vars', () => {
  assert.equal(subStr('', [v('a', '1')]), '')
  assert.equal(subStr('{{a}}', []), '{{a}}')
})

test('applyVarsToGrpcRequest resolves endpoint, messageJson, and metadata (regression: C8 stream sends)', () => {
  const req = {
    endpoint: '{{host}}:50051',
    service: 'S',
    method: 'M',
    messageJson: '{"name":"{{who}}"}',
    metadata: [{ key: 'authorization', value: 'Bearer {{token}}', enabled: true }],
    protoSource: { type: 'text', content: '' },
    tls: { enabled: false },
    discovery: null
  } as unknown as GrpcRequest
  const out = applyVarsToGrpcRequest(req, [v('host', 'localhost'), v('who', 'ada'), v('token', 'abc')])
  assert.equal(out.endpoint, 'localhost:50051')
  assert.equal(out.messageJson, '{"name":"ada"}')
  assert.equal(out.metadata[0].value, 'Bearer abc')
})

test('applyVarsToGrpcRequest returns the same object when there are no vars', () => {
  const req = { endpoint: '{{host}}', messageJson: '{}', metadata: [] } as unknown as GrpcRequest
  assert.equal(applyVarsToGrpcRequest(req, []), req)
})

test('applyVarsToHttpRequest resolves multipart text-part value and file-part filePath (Wave F fix 1)', () => {
  const req = {
    method: 'POST',
    url: 'https://example.com/upload',
    params: [],
    headers: [],
    body: {
      mode: 'multipart',
      formFields: [{ key: 'legacy', value: '{{legacyVal}}', enabled: true }],
      parts: [
        { key: 'token', kind: 'text', value: '{{token}}', enabled: true },
        { key: 'file',  kind: 'file', filePath: '/tmp/{{filename}}', enabled: true },
      ],
    },
    auth: { type: 'none' },
    timeout: 30000,
  } as unknown as HttpRequest
  const out = applyVarsToHttpRequest(req, [v('token', 'secret'), v('filename', 'upload.csv'), v('legacyVal', 'lv')])
  const parts = (out.body as { parts: { key: string; kind: string; value?: string; filePath?: string; enabled: boolean }[] }).parts
  assert.equal(parts[0].value, 'secret', 'text part value should be substituted')
  assert.equal(parts[1].filePath, '/tmp/upload.csv', 'file part filePath should be substituted')
  // backward-compat: formFields still substituted
  const fields = (out.body as { formFields: { key: string; value: string }[] }).formFields
  assert.equal(fields[0].value, 'lv', 'formFields backward-compat still substituted')
})

test('applyVarsToHttpRequest leaves multipart parts verbatim when vars is empty', () => {
  const req = {
    method: 'POST',
    url: 'https://x.com',
    params: [],
    headers: [],
    body: {
      mode: 'multipart',
      parts: [{ key: 'k', kind: 'text', value: '{{v}}', enabled: true }],
    },
    auth: { type: 'none' },
    timeout: 30000,
  } as unknown as HttpRequest
  const out = applyVarsToHttpRequest(req, [])
  assert.equal(out, req) // same reference — early-return path
})

test('applyVarsToHttpRequest resolves url, params, headers, and raw body', () => {
  const req = {
    method: 'POST',
    url: 'https://{{host}}/u',
    params: [{ key: 'q', value: '{{term}}', enabled: true }],
    headers: [{ key: 'X-Token', value: '{{token}}', enabled: true }],
    body: { mode: 'json', raw: '{"id":"{{id}}"}' },
    auth: { type: 'none' }
  } as unknown as HttpRequest
  const out = applyVarsToHttpRequest(req, [v('host', 'h'), v('term', 't'), v('token', 'k'), v('id', '7')])
  assert.equal(out.url, 'https://h/u')
  assert.equal(out.params[0].value, 't')
  assert.equal(out.headers[0].value, 'k')
  assert.equal((out.body as { raw: string }).raw, '{"id":"7"}')
})
