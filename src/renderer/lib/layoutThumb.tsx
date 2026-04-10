import type { LayoutSlot } from './layouts'

interface Props {
  slots: LayoutSlot[]
  width: number
  height: number
}

export function LayoutThumb({ slots, width, height }: Props) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <rect width={width} height={height} fill="var(--bg)" rx={2} />
      {slots.map((s, i) => (
        <rect
          key={i}
          x={s.xFrac * width + 1.5}
          y={s.yFrac * height + 1.5}
          width={s.wFrac * width - 3}
          height={s.hFrac * height - 3}
          rx={1}
          fill="var(--accent)"
          opacity={0.5 + i * 0.1}
        />
      ))}
    </svg>
  )
}
