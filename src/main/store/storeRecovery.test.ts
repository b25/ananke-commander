import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { backupCorruptFile } from './storeRecovery.ts'

test('backupCorruptFile renames an existing file to .corrupt-<timestamp>', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storerecovery-'))
  const filePath = join(dir, 'state.json')
  writeFileSync(filePath, '{ invalid json }')

  backupCorruptFile(filePath)

  assert.equal(existsSync(filePath), false, 'original file should be gone after backup')
  const entries = readdirSync(dir)
  assert.equal(entries.length, 1, 'exactly one backup file should exist')
  assert.match(entries[0]!, /^state\.json\.corrupt-\d+$/, 'backup filename should have .corrupt-<digits> suffix')
})

test('backupCorruptFile does not throw when file does not exist', () => {
  assert.doesNotThrow(() => backupCorruptFile('/nonexistent/path/that/cannot/exist/state.json'))
})

test('backupCorruptFile does not throw when path is an empty string', () => {
  assert.doesNotThrow(() => backupCorruptFile(''))
})

test('backupCorruptFile leaves unrelated files in the directory untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storerecovery-'))
  const targetPath = join(dir, 'bad.json')
  const siblingPath = join(dir, 'other.json')
  writeFileSync(targetPath, 'corrupt')
  writeFileSync(siblingPath, '{"ok":true}')

  backupCorruptFile(targetPath)

  assert.equal(existsSync(siblingPath), true, 'sibling file should be untouched')
  const entries = readdirSync(dir)
  assert.equal(entries.length, 2, 'should have sibling + one backup')
})
