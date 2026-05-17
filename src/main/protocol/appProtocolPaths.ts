import { normalize, resolve, sep } from 'node:path'

/** Resolve a request pathname to an absolute file path only if it stays under rendererRoot. */
export function resolvePathUnderRendererRoot(rawPathname: string, rendererRoot: string): string | null {
  const root = resolve(rendererRoot)
  let pathname = decodeURIComponent(rawPathname)
  if (pathname === '' || pathname === '/') pathname = '/index.html'
  const normalized = normalize(pathname).replace(/^[/\\]+/, '')
  const filePath = resolve(root, normalized)
  const inRoot = filePath === root || filePath.startsWith(root + sep)
  return inRoot ? filePath : null
}
