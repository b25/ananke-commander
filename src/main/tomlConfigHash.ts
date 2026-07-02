/**
 * Pure, Electron-free helpers for content-hash-based self-write suppression.
 * Kept in a separate module so they can be imported by Node test runner without
 * pulling in the Electron process APIs.
 */
import { createHash } from 'node:crypto'

/** SHA-1 of the UTF-8 bytes. Fast and collision-free for self-write detection. */
export function computeContentHash(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex')
}

/**
 * Returns true iff the hash of the file content we just observed matches what
 * we last wrote ourselves.  When lastWrittenHash is null we have never written,
 * so the event must be external.
 */
export function isSelfWrite(currentHash: string, lastWrittenHash: string | null): boolean {
  return lastWrittenHash !== null && currentHash === lastWrittenHash
}
