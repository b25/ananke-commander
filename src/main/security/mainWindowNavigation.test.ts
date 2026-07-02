import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMainWindowNavigationAllowed } from './mainWindowNavigation.ts'

describe('isMainWindowNavigationAllowed', () => {
  it('allows app:// URLs unconditionally', () => {
    assert.equal(isMainWindowNavigationAllowed('app://ananke-commander/'), true)
    assert.equal(isMainWindowNavigationAllowed('app://ananke-commander/index.html'), true)
    assert.equal(isMainWindowNavigationAllowed('app://index.html'), true)
  })

  it('allows dev-server origin only when isDev=true', () => {
    assert.equal(isMainWindowNavigationAllowed('http://localhost:5173/', true), true)
    assert.equal(isMainWindowNavigationAllowed('http://localhost:5173/index.html', true), true)
    assert.equal(isMainWindowNavigationAllowed('http://localhost:5173/', false), false)
    assert.equal(isMainWindowNavigationAllowed('http://localhost:5173/'), false)
  })

  it('denies https:// URLs', () => {
    assert.equal(isMainWindowNavigationAllowed('https://example.com/'), false)
    assert.equal(isMainWindowNavigationAllowed('https://evil.com/path'), false)
    assert.equal(isMainWindowNavigationAllowed('https://localhost:5173/'), false)
  })

  it('denies file:// URLs', () => {
    assert.equal(isMainWindowNavigationAllowed('file:///etc/passwd'), false)
    assert.equal(isMainWindowNavigationAllowed('file:///home/user/index.html'), false)
  })

  it('denies about:blank', () => {
    assert.equal(isMainWindowNavigationAllowed('about:blank'), false)
  })

  it('denies empty string', () => {
    assert.equal(isMainWindowNavigationAllowed(''), false)
  })

  it('denies malformed/unusual URLs', () => {
    assert.equal(isMainWindowNavigationAllowed('javascript:alert(1)'), false)
    assert.equal(isMainWindowNavigationAllowed('data:text/html,<h1>hi</h1>'), false)
  })
})
