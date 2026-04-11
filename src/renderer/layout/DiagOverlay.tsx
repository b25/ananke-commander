import { useEffect } from 'react'
import type { PaneState, WorkspaceState } from '../../shared/contracts'

interface Props {
  ws: WorkspaceState
  vpW: number
  vpH: number
  activeScreen: number
  screenCol: number
  screenRow: number
  activeLayoutId: string
  onClose: () => void
}

function fmt2(n: number) { return n.toFixed(4) }
function fmtPx(n: number) { return Math.round(n) }
function shortId(id: string) { return id.slice(0, 8) }

export function DiagOverlay({ ws, vpW, vpH, activeScreen, screenCol, screenRow, activeLayoutId, onClose }: Props) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: false }))
    return () => {
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [])
  const canvasW = vpW * 2
  const canvasH = vpH * 2
  const ox = ws.canvasOffset.x
  const oy = ws.canvasOffset.y

  const onScreen = ws.panes.filter(
    p => Math.floor(p.xPct) === screenCol && Math.floor(p.yPct) === screenRow
  )
  const collapsedIds = new Set(ws.screenCollapsed?.[activeScreen] ?? [])
  const visibleOnScreen = onScreen.filter(p => !collapsedIds.has(p.id))
  const collapsedOnScreen = onScreen.filter(p => collapsedIds.has(p.id))

  const row = (p: PaneState) => {
    const xFrac = p.xPct - Math.floor(p.xPct)
    const yFrac = p.yPct - Math.floor(p.yPct)
    const px = fmtPx(p.xPct * vpW)
    const py = fmtPx(p.yPct * vpH)
    const pw = fmtPx(p.wPct * vpW)
    const ph = fmtPx(p.hPct * vpH)
    const collapsed = collapsedIds.has(p.id)
    return (
      <tr key={p.id} style={{ opacity: collapsed ? 0.45 : 1 }}>
        <td className="diag-id">{shortId(p.id)}</td>
        <td className="diag-type">{p.type}</td>
        <td className="diag-num">{fmt2(xFrac)}</td>
        <td className="diag-num">{fmt2(yFrac)}</td>
        <td className="diag-num">{fmt2(p.wPct)}</td>
        <td className="diag-num">{fmt2(p.hPct)}</td>
        <td className="diag-px">{px},{py}</td>
        <td className="diag-px">{pw}×{ph}</td>
        {collapsed && <td className="diag-tag">collapsed</td>}
      </tr>
    )
  }

  return (
    <div className="diag-overlay">
      <button 
        type="button" 
        onClick={onClose} 
        style={{ 
          position: 'absolute', 
          top: 'var(--space-inset)', 
          right: 'var(--space-inset)', 
          background: 'none', 
          border: 'none', 
          color: 'var(--text)', 
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >✕</button>
      <div className="diag-section">
        <div className="diag-header">Viewport &amp; Canvas</div>
        <table className="diag-table">
          <tbody>
            <tr><td>Viewport</td><td className="diag-px">{fmtPx(vpW)} × {fmtPx(vpH)} px</td></tr>
            <tr><td>Canvas</td><td className="diag-px">{fmtPx(canvasW)} × {fmtPx(canvasH)} px</td></tr>
            <tr><td>Canvas offset</td><td className="diag-px">{fmtPx(ox)}, {fmtPx(oy)}</td></tr>
            <tr><td>Screen</td><td className="diag-px">{activeScreen} (col={screenCol}, row={screenRow})</td></tr>
            <tr><td>Layout</td><td className="diag-px">{activeLayoutId}</td></tr>
            <tr><td>Panes on screen</td><td className="diag-px">{visibleOnScreen.length} visible, {collapsedOnScreen.length} collapsed</td></tr>
            <tr><td>Total panes</td><td className="diag-px">{ws.panes.length}</td></tr>
          </tbody>
        </table>
      </div>

      {onScreen.length > 0 && (
        <div className="diag-section">
          <div className="diag-header">Screen {activeScreen} panes (xFrac/yFrac relative to screen)</div>
          <table className="diag-table diag-panes">
            <thead>
              <tr>
                <th>id</th><th>type</th>
                <th>xFrac</th><th>yFrac</th><th>wPct</th><th>hPct</th>
                <th>px x,y</th><th>px w×h</th>
              </tr>
            </thead>
            <tbody>{onScreen.map(row)}</tbody>
          </table>
        </div>
      )}

      {ws.panes.filter(p => Math.floor(p.xPct) !== screenCol || Math.floor(p.yPct) !== screenRow).length > 0 && (
        <div className="diag-section">
          <div className="diag-header">Other screens</div>
          <table className="diag-table diag-panes">
            <thead>
              <tr>
                <th>id</th><th>type</th>
                <th>xPct</th><th>yPct</th><th>wPct</th><th>hPct</th>
                <th>screen</th>
              </tr>
            </thead>
            <tbody>
              {ws.panes
                .filter(p => Math.floor(p.xPct) !== screenCol || Math.floor(p.yPct) !== screenRow)
                .map(p => (
                  <tr key={p.id}>
                    <td className="diag-id">{shortId(p.id)}</td>
                    <td className="diag-type">{p.type}</td>
                    <td className="diag-num">{fmt2(p.xPct)}</td>
                    <td className="diag-num">{fmt2(p.yPct)}</td>
                    <td className="diag-num">{fmt2(p.wPct)}</td>
                    <td className="diag-num">{fmt2(p.hPct)}</td>
                    <td className="diag-px">s{Math.floor(p.yPct) * 2 + Math.floor(p.xPct)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
