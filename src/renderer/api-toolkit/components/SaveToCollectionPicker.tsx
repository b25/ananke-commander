import type { Collection } from '../../../shared/api-toolkit-contracts'
import { ScrollableTabStrip } from './ScrollableTabStrip'

type Props = {
  collections: Collection[]
  onPick: (collectionId: string) => void
  onDismiss: () => void
}

export function SaveToCollectionPicker({ collections, onPick, onDismiss }: Props) {
  return (
    <div className="save-picker">
      <span className="save-picker__label">Save to:</span>
      {collections.length === 0 ? (
        <span style={{ fontSize: 10, color: 'var(--text-2)' }}>No collections — create one first</span>
      ) : (
        <ScrollableTabStrip className="tab-strip--inline" trackClassName="chip-track" ariaLabel="Collections">
          {collections.map((col) => (
            <button key={col.id} type="button" className="chip-btn" onClick={() => onPick(col.id)}>
              {col.name}
            </button>
          ))}
        </ScrollableTabStrip>
      )}
      <button type="button" className="save-picker__close" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
