import type { WorkspaceState } from '../../shared/contracts'
import { paneOnScreen, paneScreenIndex } from './screenIndex'

type DebugInfoArgs = {
  ws: WorkspaceState
  vpW: number
  vpH: number
  activeScreen: number
  screenCol: number
  screenRow: number
  activeLayoutId: string
}

/** Build the human-readable workspace/canvas/pane dump copied by "Copy Debug Info". */
export function buildDebugInfo({
  ws,
  vpW,
  vpH,
  activeScreen,
  screenCol,
  screenRow,
  activeLayoutId
}: DebugInfoArgs): string {
  // Build a global collapsed set across all screens
  const allCollapsed = Object.values(ws.screenCollapsed ?? {}).flat()
  const collapsedIds = new Set(allCollapsed)
  const lines: string[] = [
    '=== Ananke Commander Debug Info ===',
    `Timestamp:      ${new Date().toISOString()}`,
    `Workspace:      ${ws.name} (${ws.id})`,
    '',
    '--- Viewport & Canvas ---',
    `Viewport:       ${Math.round(vpW)} × ${Math.round(vpH)} px`,
    `Canvas:         ${Math.round(vpW * 2)} × ${Math.round(vpH * 2)} px`,
    `Canvas offset:  ${Math.round(ws.canvasOffset.x)}, ${Math.round(ws.canvasOffset.y)}`,
    `Active screen:  ${activeScreen} (col=${screenCol}, row=${screenRow})`,
    `Layout:         ${activeLayoutId}`,
    `Total panes:    ${ws.panes.length}`,
    '',
    '--- Screen layouts ---',
    ...([0, 1, 2, 3] as const).map((i) => {
      const col = i % 2,
        row = Math.floor(i / 2)
      const count = ws.panes.filter((p) => paneOnScreen(p, col, row)).length
      const layout = ws.screenLayouts?.[i] ?? 'full'
      const intent = ws.intentLayouts?.[i] ?? layout
      const collapsed = (ws.screenCollapsed?.[i] ?? []).length
      return `  Screen ${i}: layout=${layout} intent=${intent} panes=${count} collapsed=${collapsed}`
    }),
    '',
    '--- All panes ---',
    'id       | screen | type         | xPct   | yPct   | wPct   | hPct   | px-x  | px-y  | px-w  | px-h  | status',
    '-'.repeat(110),
    ...ws.panes.map((p) => {
      const scr = paneScreenIndex(p)
      const status = collapsedIds.has(p.id) ? 'collapsed' : 'visible'
      const px = (n: number) => String(Math.round(n)).padStart(5)
      const fr = (n: number) => n.toFixed(4).padStart(6)
      return `${p.id.slice(0, 8)} | s${scr}     | ${p.type.padEnd(12)} | ${fr(p.xPct)} | ${fr(p.yPct)} | ${fr(p.wPct)} | ${fr(p.hPct)} | ${px(p.xPct * vpW)} | ${px(p.yPct * vpH)} | ${px(p.wPct * vpW)} | ${px(p.hPct * vpH)} | ${status}`
    })
  ]
  return lines.join('\n')
}
