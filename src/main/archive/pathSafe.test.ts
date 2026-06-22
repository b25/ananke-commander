import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeArchiveMemberPath, safeJoin } from './pathSafe.ts'

test('safeJoin joins a normal relative path under root', () => {
  assert.equal(safeJoin('/root', 'sub/file.txt'), '/root/sub/file.txt')
})

test('safeJoin returns root itself for an empty entry', () => {
  assert.equal(safeJoin('/root', ''), '/root')
})

test('safeJoin rejects traversal that escapes root', () => {
  assert.equal(safeJoin('/root', '../etc/passwd'), null)
  assert.equal(safeJoin('/root', 'a/../../b'), null)
})

test('safeJoin does not treat a sibling prefix as inside root', () => {
  // /rootkit must not count as inside /root
  assert.equal(safeJoin('/root', '../rootkit/x'), null)
})

test('isSafeArchiveMemberPath accepts normal relative member paths', () => {
  assert.equal(isSafeArchiveMemberPath('dir/file.txt'), true)
  assert.equal(isSafeArchiveMemberPath('a/b/c.js'), true)
})

test('isSafeArchiveMemberPath neutralises a leading-slash absolute path to a safe relative one', () => {
  // Leading slashes are stripped, so "/etc/passwd" becomes the relative "etc/passwd"
  // (safeJoin then keeps it inside the extraction dir). This is intentional, not a bypass.
  assert.equal(isSafeArchiveMemberPath('/etc/passwd'), true)
})

test('isSafeArchiveMemberPath rejects drive-letter, traversal, and empty paths', () => {
  assert.equal(isSafeArchiveMemberPath('C:/Windows/x'), false)
  assert.equal(isSafeArchiveMemberPath('../escape'), false)
  assert.equal(isSafeArchiveMemberPath('a/../../b'), false)
  assert.equal(isSafeArchiveMemberPath(''), false)
})

test('isSafeArchiveMemberPath normalises backslashes before checking', () => {
  assert.equal(isSafeArchiveMemberPath('dir\\sub\\f.txt'), true)
  assert.equal(isSafeArchiveMemberPath('..\\escape'), false)
})
