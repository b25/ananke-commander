import { join, normalize } from 'node:path'

/** Resolve entry path under root; return null if traversal escapes root. */
export function safeJoin(root: string, entryPath: string): string | null {
  const target = normalize(join(root, entryPath))
  const rootNorm = normalize(root)
  const sep = rootNorm.endsWith('/') || (process.platform === 'win32' && rootNorm.endsWith('\\'))
  const prefix = sep ? rootNorm : rootNorm + (process.platform === 'win32' ? '\\' : '/')
  if (target === rootNorm) return target
  if (!target.startsWith(prefix)) return null
  return target
}

/** Reject absolute paths and `..` segments in archive member names. */
export function isSafeArchiveMemberPath(memberPath: string): boolean {
  const p = memberPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!p) return false
  if (p.startsWith('/') || /^[a-zA-Z]:\//.test(p)) return false
  const segments = p.split('/')
  for (const s of segments) {
    if (s === '..') return false
  }
  return true
}
