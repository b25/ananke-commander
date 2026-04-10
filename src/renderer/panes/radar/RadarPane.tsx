import { useCallback, useEffect, useRef, useState } from 'react'
import type { RadarPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { SunburstChart } from './SunburstChart'
import { useRadarData, type RadarNode } from './useRadarData'

type Props = {
  pane: RadarPaneState
  isActive: boolean
  onUpdate: (next: RadarPaneState) => void
  onClose: () => void
}

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

export function RadarPane({ pane, isActive, onUpdate, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 })
  const [selectedPath, setSelectedPath] = useState<string | undefined>()
  const [data, setData] = useState<RadarNode | null>(null)

  const handleUpdate = useCallback((partial: RadarNode) => {
    setData(partial)
  }, [])

  const { loading, error, progress } = useRadarData(pane.rootPath, handleUpdate)

  // Reset data when rootPath changes
  useEffect(() => {
    setData(null)
  }, [pane.rootPath])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const e = entries[0]
      if (e) setDimensions({ width: e.contentRect.width, height: e.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const drillDown = useCallback(
    (path: string) => {
      if (path === '..') {
        const history = [...pane.pathHistory]
        const parent = history.pop()
        if (parent) {
          onUpdate({ ...pane, rootPath: parent, pathHistory: history })
          setSelectedPath(undefined)
        }
        return
      }
      setSelectedPath(undefined)
      onUpdate({ ...pane, rootPath: path, pathHistory: [...pane.pathHistory, pane.rootPath] })
    },
    [pane, onUpdate]
  )

  useEffect(() => {
    if (!isActive || !selectedPath) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        window.dispatchEvent(new CustomEvent('radar-navigate', { detail: selectedPath }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, selectedPath])

  const breadcrumbs = [...pane.pathHistory, pane.rootPath]

  return (
    <div className="pane-tile" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PaneHeader title={pane.title} paneType="radar" onClose={onClose} />
      <div
        style={{
          padding: '2px 8px',
          fontSize: '11px',
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        {breadcrumbs.map((p, i) => (
          <span key={p + i}>
            {i > 0 && <span style={{ margin: '0 3px', opacity: 0.5 }}>›</span>}
            <span
              style={{
                cursor: i < breadcrumbs.length - 1 ? 'pointer' : 'default',
                color: i < breadcrumbs.length - 1 ? 'var(--accent)' : 'var(--fg)'
              }}
              onClick={() => {
                if (i < breadcrumbs.length - 1) {
                  onUpdate({ ...pane, rootPath: p, pathHistory: pane.pathHistory.slice(0, i) })
                  setSelectedPath(undefined)
                }
              }}
            >
              {p.split('/').pop() || p}
            </span>
          </span>
        ))}
        {data && <span className="radar-total-size"> — {formatBytes(data.size)}</span>}
      </div>
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: '13px'
            }}
          >
            <div className="radar-progress">Scanning: {progress.done}/{progress.total}</div>
          </div>
        )}
        {error && (
          <div style={{ padding: 16, fontSize: '12px', color: 'var(--muted)' }}>
            Error: {error}
          </div>
        )}
        {data && dimensions.width > 0 && (
          <SunburstChart
            data={data}
            width={dimensions.width}
            height={dimensions.height}
            onDrillDown={drillDown}
            onSelect={setSelectedPath}
            selectedPath={selectedPath}
          />
        )}
      </div>
    </div>
  )
}
