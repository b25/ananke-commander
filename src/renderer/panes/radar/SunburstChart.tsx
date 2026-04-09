import { useMemo } from 'react'
import { hierarchy, partition } from 'd3-hierarchy'
import type { HierarchyRectangularNode } from 'd3-hierarchy'
import type { RadarNode } from './useRadarData'

type Props = {
  data: RadarNode
  width: number
  height: number
  onDrillDown: (path: string) => void
  onSelect: (path: string) => void
  selectedPath?: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

const depthOpacities = [0.9, 0.7, 0.5, 0.35, 0.25]

export function SunburstChart({ data, width, height, onDrillDown, onSelect, selectedPath }: Props) {
  const radius = Math.min(width, height) / 2

  const root = useMemo(() => {
    const h = hierarchy(data)
      .sum((d) => (!d.children || d.children.length === 0) ? Math.max(d.size, 1) : 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    return partition<RadarNode>().size([2 * Math.PI, radius])(h)
  }, [data, radius])

  const arcPath = (d: HierarchyRectangularNode<RadarNode>): string => {
    const innerR = d.depth === 0 ? 0 : d.y0
    const outerR = d.y1
    const startAngle = d.x0 - Math.PI / 2
    const endAngle = d.x1 - Math.PI / 2
    if (Math.abs(endAngle - startAngle) < 0.001) return ''
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
    const cos = Math.cos
    const sin = Math.sin
    if (innerR === 0) {
      return [
        'M 0 0',
        `L ${cos(startAngle) * outerR} ${sin(startAngle) * outerR}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${cos(endAngle) * outerR} ${sin(endAngle) * outerR}`,
        'Z'
      ].join(' ')
    }
    return [
      `M ${cos(startAngle) * innerR} ${sin(startAngle) * innerR}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 1 ${cos(endAngle) * innerR} ${sin(endAngle) * innerR}`,
      `L ${cos(endAngle) * outerR} ${sin(endAngle) * outerR}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 0 ${cos(startAngle) * outerR} ${sin(startAngle) * outerR}`,
      'Z'
    ].join(' ')
  }

  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const descendants = root.descendants().filter((d) => d.depth > 0)
  const centerR = radius * 0.18

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <g transform={`translate(${width / 2},${height / 2})`}>
        {descendants.map((d, i) => {
          const isSelected = d.data.path === selectedPath
          const opacity = depthOpacities[Math.min(d.depth - 1, depthOpacities.length - 1)] ?? 0.2
          return (
            <path
              key={d.data.path + i}
              d={arcPath(d)}
              fill={
                isSelected
                  ? 'var(--accent)'
                  : `color-mix(in srgb, var(--accent) ${Math.round(opacity * 60)}%, var(--pane))`
              }
              stroke="var(--border)"
              strokeWidth={0.5}
              style={{
                cursor: d.data.isDirectory ? 'pointer' : 'default',
                transition: prefersReducedMotion ? 'none' : 'fill 0.15s'
              }}
              onClick={() => {
                if (d.data.isDirectory) onSelect(d.data.path)
              }}
              onDoubleClick={() => {
                if (d.data.isDirectory) onDrillDown(d.data.path)
              }}
            >
              <title>{d.data.name} — {formatSize(d.value ?? d.data.size)}</title>
            </path>
          )
        })}
        {/* Center up-button */}
        <circle
          r={centerR}
          fill="var(--pane)"
          stroke="var(--border)"
          strokeWidth={1}
          style={{ cursor: 'pointer' }}
          onClick={() => onDrillDown('..')}
        />
        <text
          textAnchor="middle"
          dy="0.35em"
          fontSize={11}
          fill="var(--muted)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ↑ Up
        </text>
      </g>
    </svg>
  )
}
