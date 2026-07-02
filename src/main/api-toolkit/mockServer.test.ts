import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchPattern } from './mockServer.ts'

describe('matchPattern – regex metacharacter escaping (CORR-5)', () => {
  // These tests are RED on original code (matchPattern not exported / throws on bad pattern)

  it('pattern with ( does not throw and matches the literal paren prefix', () => {
    assert.doesNotThrow(() => matchPattern('/api/(v1/*', '/api/(v1/foo'))
    assert.equal(matchPattern('/api/(v1/*', '/api/(v1/foo'), true)
    assert.equal(matchPattern('/api/(v1/*', '/api/v1/foo'), false)
  })

  it('pattern with [ does not throw and matches the literal bracket', () => {
    assert.doesNotThrow(() => matchPattern('/files/[abc]*', '/files/[abc]something'))
    assert.equal(matchPattern('/files/[abc]*', '/files/[abc]something'), true)
    assert.equal(matchPattern('/files/[abc]*', '/files/asomething'), false)
  })

  it('pattern with + does not throw and matches it literally', () => {
    assert.doesNotThrow(() => matchPattern('/a+b/*', '/a+b/x'))
    assert.equal(matchPattern('/a+b/*', '/a+b/x'), true)
    assert.equal(matchPattern('/a+b/*', '/ab/x'), false)
  })

  it('pattern with . matches it literally, not as any-char', () => {
    assert.equal(matchPattern('/api/v1.0/*', '/api/v1.0/resource'), true)
    assert.equal(matchPattern('/api/v1.0/*', '/api/v1X0/resource'), false)
  })

  it('single * still works as a single-segment wildcard', () => {
    assert.equal(matchPattern('/api/*', '/api/anything'), true)
    assert.equal(matchPattern('/api/*', '/api/a/b'), false)
  })

  it('** works as a cross-path wildcard', () => {
    assert.equal(matchPattern('/api/**', '/api/a/b/c'), true)
    assert.equal(matchPattern('/static/**', '/static/js/bundle.js'), true)
  })

  it('exact match (no wildcard) still works', () => {
    assert.equal(matchPattern('/api/v1', '/api/v1'), true)
    assert.equal(matchPattern('/api/v1', '/api/v2'), false)
  })

  it('query string is stripped from reqPath before matching', () => {
    assert.equal(matchPattern('/api/*', '/api/foo?bar=1'), true)
  })
})
