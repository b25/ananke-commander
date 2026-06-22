import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinPath, parentDir } from './pathUtils.ts'

test('joinPath joins POSIX paths and skips empty segments', () => {
  assert.equal(joinPath('/a/b', 'c', 'd'), '/a/b/c/d')
  assert.equal(joinPath('/a/b/', 'c'), '/a/b/c')
  assert.equal(joinPath('/a', '', 'c'), '/a/c')
})

test('joinPath uses backslash separators for Windows-style bases', () => {
  assert.equal(joinPath('C:\\a', 'b'), 'C:\\a\\b')
  assert.equal(joinPath('C:\\a\\', 'b', 'c'), 'C:\\a\\b\\c')
})

test('joinPath strips leading/trailing separators from segments', () => {
  assert.equal(joinPath('/a', '/b/', '/c'), '/a/b/c')
})

test('parentDir returns the parent for POSIX paths', () => {
  assert.equal(parentDir('/a/b/c'), '/a/b')
  assert.equal(parentDir('/a/b/'), '/a')
  assert.equal(parentDir('/a'), '/')
})

test('parentDir handles Windows paths', () => {
  assert.equal(parentDir('C:\\a\\b'), 'C:\\a')
})
