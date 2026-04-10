import { LAYOUTS, type Layout, type LayoutSlot } from '../lib/layouts'

interface Props {
  activeLayoutId: string
  onSelect: (layout: Layout) => void
}

function Thumb({ slots }: { slots: LayoutSlot[] }) {
  return (
    <svg width={36} height={26} viewBox="0 0 36 26" aria-hidden>
      <rect width={36} height={26} fill="var(--bg)" rx={2} />
      {slots.map((s, i) => (
        <rect key={i} x={s.xFrac * 36 + 1.5} y={s.yFrac * 26 + 1.5}
          width={s.wFrac * 36 - 3} height={s.hFrac * 26 - 3}
          rx={1} fill="var(--accent)" opacity={0.5 + i * 0.1} />
      ))}
    </svg>
  )
}

export function ArrangeMenu({ activeLayoutId, onSelect }: Props) {
  return (
    <div className="arrange-strip">
      {LAYOUTS.map((layout) => (
        <button
          key={layout.id}
          className={`arrange-strip__btn${layout.id === activeLayoutId ? ' active' : ''}`}
          title={layout.label}
          onClick={() => onSelect(layout)}
        >
          <Thumb slots={layout.slots} />
        </button>
      ))}
    </div>
  )
}
