import { useEffect, useState } from 'react'

export interface RadarNode {
  name: string
  path: string
  size: number
  children?: RadarNode[]
  isDirectory: boolean
}

async function getFolderSizeOnce(path: string): Promise<number> {
  return new Promise((resolve) => {
    let unsubDone: (() => void) | undefined
    let unsubErr: (() => void) | undefined

    const cleanup = () => {
      unsubDone?.()
      unsubErr?.()
    }

    unsubDone = window.ananke.fs.onFolderSizeDone((msg) => {
      if (msg.dirPath !== path) return
      cleanup()
      resolve(msg.totalSize)
    })

    unsubErr = window.ananke.fs.onFolderSizeError((msg) => {
      if (msg.dirPath !== path) return
      cleanup()
      resolve(0)
    })

    void window.ananke.fs.startFolderSize(path)
  })
}

export function useRadarData(rootPath: string) {
  const [data, setData] = useState<RadarNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load(): Promise<RadarNode> {
      const entries = await window.ananke.fs.listDir(rootPath)
      const name = rootPath.split('/').pop() || rootPath
      const children: RadarNode[] = []

      for (const entry of entries.slice(0, 50)) {
        if (cancelled) break
        if (entry.isDirectory) {
          const size = await getFolderSizeOnce(entry.path)
          children.push({ name: entry.name, path: entry.path, size, isDirectory: true })
        } else {
          children.push({ name: entry.name, path: entry.path, size: entry.size, isDirectory: false })
        }
      }

      const totalSize = children.reduce((acc, c) => acc + c.size, 0)
      return { name, path: rootPath, size: totalSize, children, isDirectory: true }
    }

    load()
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [rootPath])

  return { data, loading, error }
}
