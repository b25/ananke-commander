import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { resolvePathUnderRendererRoot } from './appProtocolPaths.ts'

describe('resolvePathUnderRendererRoot', () => {
  const root = join(tmpdir(), 'ananke-protocol-root-test')

  it('maps / and empty to index.html under root', () => {
    const a = resolvePathUnderRendererRoot('/', root)
    const b = resolvePathUnderRendererRoot('', root)
    assert.ok(a)
    assert.ok(b)
    assert.equal(a, b)
    assert.ok(a!.endsWith(`${join('index.html')}`) || a!.endsWith('index.html'))
  })

  it('resolves a normal asset path inside root', () => {
    const p = resolvePathUnderRendererRoot('/assets/foo.png', root)
    assert.ok(p)
    assert.ok(p!.includes('assets'))
    assert.ok(p!.includes('foo.png'))
  })

  it('returns null when path escapes root via dot segments', () => {
    const escaped = resolvePathUnderRendererRoot(
      '%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      root
    )
    assert.equal(escaped, null)
  })
})
