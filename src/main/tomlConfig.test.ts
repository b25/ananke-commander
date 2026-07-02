/**
 * Unit tests for the pure content-hash helpers exported from tomlConfig.ts.
 *
 * These cover the self-write suppression logic (Task 26 / CORR-14) without
 * needing Electron, the filesystem, or timing-sensitive watcher callbacks.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
// Import from the Electron-free helper module so node:test can load it without
// the Electron process being available.
import { computeContentHash, isSelfWrite } from './tomlConfigHash.ts'

describe('computeContentHash', () => {
  it('returns the same hash for the same input', () => {
    const a = computeContentHash('hello world')
    const b = computeContentHash('hello world')
    assert.equal(a, b)
  })

  it('returns different hashes for different inputs', () => {
    const a = computeContentHash('hello world')
    const b = computeContentHash('hello world!')
    assert.notEqual(a, b)
  })

  it('returns a non-empty lowercase hex string (SHA-1 = 40 chars)', () => {
    const h = computeContentHash('test')
    assert.match(h, /^[0-9a-f]{40}$/)
  })

  it('handles the empty string without throwing', () => {
    assert.doesNotThrow(() => computeContentHash(''))
    assert.match(computeContentHash(''), /^[0-9a-f]{40}$/)
  })

  it('is sensitive to content differences — differs for content with one extra space', () => {
    assert.notEqual(computeContentHash('abc'), computeContentHash('abc '))
  })
})

describe('isSelfWrite', () => {
  it('returns true when current hash matches the last-written hash', () => {
    const h = computeContentHash('# workspace.toml\nactive_workspace = "ws1"\n')
    assert.equal(isSelfWrite(h, h), true)
  })

  it('returns false when current hash differs from the last-written hash', () => {
    const h1 = computeContentHash('version = 1')
    const h2 = computeContentHash('version = 2')
    assert.equal(isSelfWrite(h1, h2), false)
  })

  it('returns false when lastWrittenHash is null (never written)', () => {
    const h = computeContentHash('some content')
    assert.equal(isSelfWrite(h, null), false)
  })

  it('returns false when both hashes are different non-null values', () => {
    const a = computeContentHash('external edit content')
    const b = computeContentHash('app-written content')
    assert.equal(isSelfWrite(a, b), false)
    assert.equal(isSelfWrite(b, a), false)
  })
})
