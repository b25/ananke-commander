/**
 * TDD tests for Task 7 / CORR-6: worker crash handling in FolderSizeManager.
 *
 * RED: before adding error/exit handlers, crashes left activeRequests populated
 * and forwarded nothing to the renderer — the renderer UI would stall forever.
 * GREEN: handlers clear activeRequests and send fs:folderSize:error for each
 * in-flight request.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { FolderSizeManager } from './folderSizeManager.ts'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakeWin() {
  const sent: Array<{ channel: string; payload: unknown }> = []
  const win = {
    isDestroyed: () => false,
    webContents: {
      send(channel: string, payload: unknown) {
        sent.push({ channel, payload })
      }
    },
    _sent: sent
  }
  return win
}

class FakeWorker extends EventEmitter {
  readonly messages: unknown[] = []
  postMessage(msg: unknown) { this.messages.push(msg) }
  terminate() {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('FolderSizeManager: worker error clears activeRequests and emits fs:folderSize:error per request', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FolderSizeManager(fakeWin as any, () => fakeWorker as any)

  // Start two in-flight requests
  const r1 = mgr.start('/home/user/docs')
  const r2 = mgr.start('/home/user/pics')

  // Crash the worker
  fakeWorker.emit('error', new Error('worker OOM'))

  const errors = fakeWin._sent.filter(e => e.channel === 'fs:folderSize:error')
  assert.equal(errors.length, 2, 'one error event per in-flight request')

  const requestIds = errors.map(e => (e.payload as any).requestId)
  assert.ok(requestIds.includes(r1), 'request r1 surfaced an error')
  assert.ok(requestIds.includes(r2), 'request r2 surfaced an error')
})

test('FolderSizeManager: after worker error, new start() is accepted (spawns fresh worker)', () => {
  let callCount = 0
  const fakeWin = makeFakeWin()
  const mgr = new FolderSizeManager(fakeWin as any, () => {
    callCount++
    return new FakeWorker() as any
  })

  mgr.start('/tmp/foo')
  assert.equal(callCount, 1)

  const w1 = (mgr as any).worker as FakeWorker
  w1.emit('error', new Error('crash'))

  // start() should work again without throwing
  assert.doesNotThrow(() => mgr.start('/tmp/bar'), 'start() accepted after crash')
  assert.equal(callCount, 2, 'fresh worker spawned')
})

test('FolderSizeManager: nonzero exit clears requests and emits errors', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FolderSizeManager(fakeWin as any, () => fakeWorker as any)

  const r1 = mgr.start('/data/a')

  fakeWorker.emit('exit', 137) // SIGKILL

  const errors = fakeWin._sent.filter(e => e.channel === 'fs:folderSize:error')
  assert.equal(errors.length, 1)
  assert.ok((errors[0].payload as any).message.includes('code 137'))
  assert.equal((errors[0].payload as any).requestId, r1)
})

test('FolderSizeManager: clean exit (code 0) after done-message does NOT emit spurious error', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FolderSizeManager(fakeWin as any, () => fakeWorker as any)

  const r1 = mgr.start('/data/b')
  // Simulate normal completion
  fakeWorker.emit('message', { type: 'done', requestId: r1, dirPath: '/data/b', totalSize: 1024 })
  fakeWorker.emit('exit', 0)

  const errors = fakeWin._sent.filter(e => e.channel === 'fs:folderSize:error')
  assert.equal(errors.length, 0, 'no spurious error on clean exit')
})

test('FolderSizeManager: error + exit sequence does not double-emit', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FolderSizeManager(fakeWin as any, () => fakeWorker as any)

  mgr.start('/data/c')
  fakeWorker.emit('error', new Error('boom'))
  fakeWorker.emit('exit', 1)

  const errors = fakeWin._sent.filter(e => e.channel === 'fs:folderSize:error')
  assert.equal(errors.length, 1, 'exactly one error event despite error+exit sequence')
})
