import type { ReactNode } from 'react'
import { ScrollableTabStrip } from './ScrollableTabStrip'

export type PanelTab = {
  id: string
  label: ReactNode
}

type Props = {
  tabs: PanelTab[]
  activeId: string
  onSelect: (id: string) => void
  trailing?: ReactNode
}

export function PanelTabStrip({ tabs, activeId, onSelect, trailing }: Props) {
  return (
    <div className="panel-tabs-row">
      <ScrollableTabStrip
        scrollKey={activeId}
        className="tab-strip--panel"
        trackClassName="panel-tabs"
        ariaLabel="Request sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`panel-tab ${activeId === t.id ? 'active' : ''}`}
            data-scroll-active={activeId === t.id ? 'true' : undefined}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </ScrollableTabStrip>
      {trailing ? <div className="panel-tabs-row__trailing">{trailing}</div> : null}
    </div>
  )
}
