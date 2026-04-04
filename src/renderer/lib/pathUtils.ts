/** Parent directory for POSIX or Windows paths (renderer-safe, no node:path). */
export function parentDir(dir: string): string {
  const trimmed = dir.replace(/[/\\]+$/, '')
  if (!trimmed) return dir
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (i < 0) return trimmed
  if (i === 0) return trimmed[0] === '/' ? '/' : trimmed.slice(0, 1)
  const parent = trimmed.slice(0, i)
  // "C:" style root → stay on "C:\" 
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`
  return parent || '/'
}

/** Join a directory path with one or more segments using `\` or `/` heuristics (renderer-safe). */
export function joinPath(dir: string, ...segments: string[]): string {
  let base = dir.replace(/[/\\]+$/, '') || dir
  const useWin = /\\/.test(base) || /^[A-Za-z]:/.test(base)
  const sep = useWin ? '\\' : '/'
  for (const s of segments) {
    if (!s) continue
    const part = s.replace(/^[/\\]+|[/\\]+$/g, '')
    if (!part) continue
    base = `${base}${sep}${part}`
  }
  return base
}
