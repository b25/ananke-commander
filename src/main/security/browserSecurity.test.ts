import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isExternalUrlAllowed, isNavigationAllowed, parseAllowlistHost, setGuestAllowedHosts } from './browserSecurity.ts'

describe('isNavigationAllowed', () => {
  it('allows http(s) only for trusted hosts', () => {
    assert.equal(isNavigationAllowed('https://example.com/'), true)
    assert.equal(isNavigationAllowed('http://www.example.com/'), true)
    assert.equal(isNavigationAllowed('https://localhost:3000/'), true)
    assert.equal(isNavigationAllowed('http://127.0.0.1/'), true)
    assert.equal(isNavigationAllowed('http://[::1]/'), true)
    assert.equal(isNavigationAllowed('https://evil.example.com/'), false)
    assert.equal(isNavigationAllowed('https://google.com/'), false)
  })

  it('allows only about:blank for about:', () => {
    assert.equal(isNavigationAllowed('about:blank'), true)
    assert.equal(isNavigationAllowed('about:blank#x'), false)
    assert.equal(isNavigationAllowed('about:config'), false)
  })

  it('blocks data: URLs', () => {
    assert.equal(isNavigationAllowed('data:text/html,hi'), false)
  })

  it('rejects non-http schemes', () => {
    assert.equal(isNavigationAllowed('file:///etc/passwd'), false)
    assert.equal(isNavigationAllowed('javascript:alert(1)'), false)
  })

  it('treats bare hostnames as https for the allowlist check', () => {
    assert.equal(isNavigationAllowed('example.com'), true)
    assert.equal(isNavigationAllowed('malicious.test'), false)
  })

  it('returns false for malformed URLs', () => {
    assert.equal(isNavigationAllowed('https://'), false)
  })
})

describe('setGuestAllowedHosts', () => {
  it('allows configured extra hosts', () => {
    setGuestAllowedHosts(['google.com', 'https://docs.github.com/foo'])
    assert.equal(isNavigationAllowed('https://google.com/search'), true)
    assert.equal(isNavigationAllowed('https://docs.github.com/'), true)
    assert.equal(isNavigationAllowed('https://evil.google.com/'), false)
    setGuestAllowedHosts([])
  })
})

describe('parseAllowlistHost', () => {
  it('normalizes bare hostnames and URLs', () => {
    assert.equal(parseAllowlistHost('GitHub.com'), 'github.com')
    assert.equal(parseAllowlistHost('https://npmjs.com/package/foo'), 'npmjs.com')
    assert.equal(parseAllowlistHost(''), null)
  })
})

describe('isExternalUrlAllowed', () => {
  it('allows any http(s) URL with a hostname', () => {
    assert.equal(isExternalUrlAllowed('https://google.com/search?q=1'), true)
    assert.equal(isExternalUrlAllowed('http://evil.example.com/'), true)
    assert.equal(isExternalUrlAllowed('https://localhost:8080/'), true)
  })

  it('blocks non-http schemes and malformed URLs', () => {
    assert.equal(isExternalUrlAllowed('file:///etc/passwd'), false)
    assert.equal(isExternalUrlAllowed('javascript:alert(1)'), false)
    assert.equal(isExternalUrlAllowed('about:blank'), false)
    assert.equal(isExternalUrlAllowed('https://'), false)
  })
})
