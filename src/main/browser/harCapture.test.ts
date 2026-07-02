/**
 * Tests for sensitive-header redaction in HAR capture (Task 23 / SEC-5).
 *
 * Verifies that `redactHeaders` replaces values of Authorization, Cookie,
 * Set-Cookie, Proxy-Authorization, and x-api-key with [REDACTED] while
 * leaving non-sensitive headers intact and preserving header names.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redactHeaders } from './harCapture.ts'

test('redactHeaders: replaces Authorization value with [REDACTED]', () => {
  const input = [{ name: 'Authorization', value: 'Bearer secret-token' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].name, 'Authorization')
  assert.strictEqual(result[0].value, '[REDACTED]')
})

test('redactHeaders: replaces Cookie value with [REDACTED]', () => {
  const input = [{ name: 'Cookie', value: 'session=abc123' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, '[REDACTED]')
})

test('redactHeaders: replaces Set-Cookie value with [REDACTED]', () => {
  const input = [{ name: 'Set-Cookie', value: 'session=abc123; HttpOnly' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, '[REDACTED]')
})

test('redactHeaders: replaces Proxy-Authorization value with [REDACTED]', () => {
  const input = [{ name: 'Proxy-Authorization', value: 'Basic dXNlcjpwYXNz' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, '[REDACTED]')
})

test('redactHeaders: replaces x-api-key value with [REDACTED]', () => {
  const input = [{ name: 'x-api-key', value: 'my-secret-key' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, '[REDACTED]')
})

test('redactHeaders: case-insensitive matching (AUTHORIZATION, COOKIE)', () => {
  const input = [
    { name: 'AUTHORIZATION', value: 'Bearer token' },
    { name: 'COOKIE', value: 'x=1' }
  ]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, '[REDACTED]')
  assert.strictEqual(result[1].value, '[REDACTED]')
})

test('redactHeaders: leaves non-sensitive headers untouched', () => {
  const input = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Accept', value: 'text/html' },
    { name: 'X-Request-ID', value: 'req-42' }
  ]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, 'application/json')
  assert.strictEqual(result[1].value, 'text/html')
  assert.strictEqual(result[2].value, 'req-42')
})

test('redactHeaders: mixed sensitive and non-sensitive headers', () => {
  const input = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Authorization', value: 'Bearer secret' },
    { name: 'Accept', value: '*/*' },
    { name: 'cookie', value: 'session=xyz' }
  ]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].value, 'application/json')
  assert.strictEqual(result[1].value, '[REDACTED]')
  assert.strictEqual(result[2].value, '*/*')
  assert.strictEqual(result[3].value, '[REDACTED]')
})

test('redactHeaders: preserves header names (does not rename them)', () => {
  const input = [{ name: 'Authorization', value: 'Bearer token' }]
  const result = redactHeaders(input)
  assert.strictEqual(result[0].name, 'Authorization')
})

test('redactHeaders: returns new array (does not mutate input)', () => {
  const input = [{ name: 'Authorization', value: 'Bearer token' }]
  const result = redactHeaders(input)
  assert.notStrictEqual(result, input)
  // Original unchanged
  assert.strictEqual(input[0].value, 'Bearer token')
})
