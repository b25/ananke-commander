/**
 * TDD tests for Task 7 / CORR-6: worker crash handling in FileJobManager.
 *
 * RED proof: before adding error/exit handlers to fileJobManager.ts these tests
 * failed because (a) no error was forwarded to the renderer and (b) runningJobId
 * was never cleared, so the second runJob() threw "already in progress".
 * GREEN: handlers added + workerFactory injection makes them pass.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { FileJobManager } from './fileJobManager.ts'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Minimal BrowserWindow stand-in — tracks every send() call. */
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

/** EventEmitter that mimics the Worker API surface used by the manager. */
class FakeWorker extends EventEmitter {
  readonly messages: unknown[] = []
  postMessage(msg: unknown) { this.messages.push(msg) }
  terminate() { /* no-op for test control */ }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('FileJobManager: worker error event clears runningJobId and emits file-job:error', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FileJobManager(fakeWin as any, () => fakeWorker as any)

  // Start a job — triggers ensureWorker() which attaches listeners
  mgr.runJob('copy', ['/src/a'], '/dst')
  assert.equal(fakeWorker.messages.length, 1, 'postMessage called once')

  // Simulate worker crash (unhandled exception / OOM)
  fakeWorker.emit('error', new Error('OOM: worker killed'))

  const errors = fakeWin._sent.filter(e => e.channel === 'file-job:error')
  assert.equal(errors.length, 1, 'exactly one file-job:error sent to renderer')
  assert.ok(
    (errors[0].payload as any).message.includes('OOM'),
    'error message propagated'
  )
  assert.ok((errors[0].payload as any).jobId, 'jobId present in error payload')
})

test('FileJobManager: after worker error, subsequent runJob() is accepted (lock cleared)', () => {
  let callCount = 0
  const fakeWin = makeFakeWin()
  const mgr = new FileJobManager(fakeWin as any, () => {
    callCount++
    return new FakeWorker() as any
  })

  mgr.runJob('copy', ['/src/a'], '/dst')
  assert.equal(callCount, 1, 'first worker created')

  // Crash the first worker
  const firstWorker = (mgr as any).worker as FakeWorker
  firstWorker.emit('error', new Error('crash'))

  // A second runJob must NOT throw "already in progress"
  assert.doesNotThrow(
    () => mgr.runJob('move', ['/src/b'], '/dst2'),
    'runJob accepted after crash — lock was cleared'
  )
  assert.equal(callCount, 2, 'a fresh worker was spawned for the second job')
})

test('FileJobManager: nonzero worker exit clears lock and emits file-job:error', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FileJobManager(fakeWin as any, () => fakeWorker as any)

  mgr.runJob('delete', ['/src/c'])

  // Simulate abnormal exit (e.g. process.exit(1) inside worker)
  fakeWorker.emit('exit', 1)

  const errors = fakeWin._sent.filter(e => e.channel === 'file-job:error')
  assert.equal(errors.length, 1, 'one error event for nonzero exit')
  assert.ok(
    (errors[0].payload as any).message.includes('code 1'),
    'exit code mentioned in message'
  )
  assert.doesNotThrow(
    () => mgr.runJob('copy', ['/src/d'], '/dst3'),
    'runJob accepted after crash exit'
  )
})

test('FileJobManager: clean exit (code 0) after done-message emits NO spurious error', () => {
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FileJobManager(fakeWin as any, () => fakeWorker as any)

  const jobId = mgr.runJob('copy', ['/src/e'], '/dst4')

  // Simulate normal completion: message 'done' then clean worker exit
  fakeWorker.emit('message', { type: 'done', jobId })
  fakeWorker.emit('exit', 0)

  const errors = fakeWin._sent.filter(e => e.channel === 'file-job:error')
  assert.equal(errors.length, 0, 'no spurious error on clean code-0 exit')
})

test('FileJobManager: error + exit sequence does not double-emit', () => {
  // After an unhandled exception, Node emits 'error' then 'exit' on the Worker.
  // Only one file-job:error must reach the renderer.
  const fakeWorker = new FakeWorker()
  const fakeWin = makeFakeWin()
  const mgr = new FileJobManager(fakeWin as any, () => fakeWorker as any)

  mgr.runJob('copy', ['/src/f'], '/dst5')
  fakeWorker.emit('error', new Error('unhandled rejection'))
  fakeWorker.emit('exit', 1) // Node fires this right after

  const errors = fakeWin._sent.filter(e => e.channel === 'file-job:error')
  assert.equal(errors.length, 1, 'exactly one error event despite error+exit sequence')
})
