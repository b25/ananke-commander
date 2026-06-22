/**
 * Well-known type widgets — Timestamp, Duration, Empty, FieldMask, and the
 * Struct/Value/ListValue + wrappers JSON-textarea fallback.
 */

import type { WellKnownType } from '../../../../shared/api-toolkit-contracts'
import { isoToLocal, localToIso } from './shared'

export function WktField({ wkt, value, onChange }: { wkt: WellKnownType; value: unknown; onChange: (v: unknown) => void }) {
  switch (wkt) {
    case 'Timestamp':
      return (
        <input
          type="datetime-local"
          className="form-input"
          step="1"
          value={isoToLocal(String(value ?? ''))}
          onChange={(e) => onChange(localToIso(e.target.value))}
        />
      )
    case 'Duration':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="form-input"
            type="number"
            step="0.001"
            placeholder="seconds"
            value={String(value ?? '').replace('s', '')}
            onChange={(e) => onChange(`${e.target.value}s`)}
            style={{ flex: 1 }}
          />
          <span style={{ color: 'var(--text-2)', fontSize: 10 }}>s</span>
        </div>
      )
    case 'Empty':
      return <span style={{ color: 'var(--text-2)', fontSize: 10 }}>(empty)</span>
    case 'FieldMask':
      return (
        <input
          className="form-input"
          placeholder="field1,field2.subField"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      // Struct/Value/ListValue + wrappers → JSON textarea
      return (
        <textarea
          className="code-editor"
          style={{ minHeight: 60, fontSize: 10 }}
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)) } catch { onChange(e.target.value) } }}
        />
      )
  }
}
