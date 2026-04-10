import { memo } from 'react'
import type { LayoutSlot } from './layouts'

interface Props {
  slots: LayoutSlot[]
  width: number
  height: number
  invert?: boolean
}

export const LayoutThumb = memo(function LayoutThumb({ slots, width, height, invert }: Props) {
  const bgFill = invert ? 'transparent' : 'var(--bg)'
  const slotFill = invert ? 'rgba(0,0,0,0.25)' : 'var(--accent)'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <rect width={width} height={height} fill={bgFill} rx={2} />
      {slots.map((s, i) => (
        <rect
          key={i}
          x={s.xFrac * width + 1.5}
          y={s.yFrac * height + 1.5}
          width={s.wFrac * width - 3}
          height={s.hFrac * height - 3}
          rx={1}
          fill={slotFill}
          opacity={0.5 + i * 0.1}
        />
      ))}
    </svg>
  )
})
