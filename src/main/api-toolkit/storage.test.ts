import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readJson, writeJson } from './storage-io.ts'

// ─── (a) Round-trip ──────────────────────────────────────────────────────────

test('writeJson → readJson round-trips data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'data.json')
    const data = { foo: 'bar', n: 42, nested: { arr: [1, 2, 3] } }
    writeJson(file, data)
    const result = readJson<typeof data>(file, { foo: '', n: 0, nested: { arr: [] } })
    assert.deepEqual(result, data)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJson returns fallback for missing file without error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'nonexistent.json')
    const result = readJson(file, 'default-value')
    assert.equal(result, 'default-value')
    // No .corrupt-* backup should be created for a missing file
    const backups = readdirSync(dir).filter((f) => f.includes('.corrupt-'))
    assert.equal(backups.length, 0, 'No backup should be created for missing file')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── (b) Interrupted write — stale .tmp must not linger ──────────────────────

test('writeJson cleans up .tmp — stale tmp from prior crash does not persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'data.json')
    // Simulate a previous crash: stale garbage left in .tmp
    writeFileSync(file + '.tmp', 'GARBAGE_FROM_PREVIOUS_CRASH', 'utf8')
    // Write new valid data atomically
    writeJson(file, { ok: true })
    // .tmp must be gone (renamed to destination)
    assert.equal(
      existsSync(file + '.tmp'),
      false,
      '.tmp file must not exist after a successful atomic write'
    )
    // Real file must hold the valid data we wrote
    assert.deepEqual(readJson<{ ok: boolean }>(file, { ok: false }), { ok: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeJson destination is intact when a second write follows a first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'seq.json')
    writeJson(file, { v: 1 })
    writeJson(file, { v: 2 })
    assert.deepEqual(readJson<{ v: number }>(file, { v: 0 }), { v: 2 })
    assert.equal(existsSync(file + '.tmp'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── (c) Corrupt file → fallback + .corrupt-* backup ────────────────────────

test('readJson backs up corrupt file and returns fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'corrupt.json')
    writeFileSync(file, 'NOT VALID JSON {{{', 'utf8')
    const result = readJson(file, 'fallback')
    // Must return the fallback
    assert.equal(result, 'fallback')
    // Must have created exactly one .corrupt-* backup
    const backups = readdirSync(dir).filter((f) => f.includes('.corrupt-'))
    assert.equal(backups.length, 1, 'Expected exactly one .corrupt-* backup file')
    // The backup name must contain a timestamp suffix
    assert.ok(/\.corrupt-\d+$/.test(backups[0]), `Backup name format unexpected: ${backups[0]}`)
    // The backup must contain the original corrupt content
    const backupContent = readFileSync(join(dir, backups[0]), 'utf8')
    assert.equal(backupContent, 'NOT VALID JSON {{{')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJson corrupt file backup does not interfere with subsequent writeJson', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-test-'))
  try {
    const file = join(dir, 'data.json')
    // Corrupt file
    writeFileSync(file, '{bad json', 'utf8')
    const fallback = readJson(file, [] as number[])
    assert.deepEqual(fallback, [])
    // The corrupt file was renamed away; we can now write fresh data
    writeJson(file, [1, 2, 3])
    assert.deepEqual(readJson<number[]>(file, []), [1, 2, 3])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
