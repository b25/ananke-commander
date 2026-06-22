import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../../shared/api-toolkit-contracts.js'
import type { MockRoute, MockServerData } from '../../../shared/api-toolkit-contracts.js'
import { mockServer } from '../mockServer.js'
import * as mockStorage from '../mockStorage.js'

/** Mock proxy server: data persistence, start/stop, and batched route-hit notifications. */
export function registerMockIpc(): void {
  const mockHitBatch = new Map<string, number>()
  let mockHitFlushTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleMockRouteHit = (win: BrowserWindow | undefined, routeId: string, hitCount: number): void => {
    mockHitBatch.set(routeId, hitCount)
    if (mockHitFlushTimer) return
    mockHitFlushTimer = setTimeout(() => {
      mockHitFlushTimer = null
      const batch = new Map(mockHitBatch)
      mockHitBatch.clear()
      for (const [id, count] of batch) {
        win?.webContents.send(IPC.MOCK_ROUTE_HIT, id, count)
      }
    }, 100)
  }

  ipcMain.handle(IPC.MOCK_GET_DATA, () => mockStorage.readMockData())

  ipcMain.handle(IPC.MOCK_SAVE_DATA, (_e, data: MockServerData) => {
    mockStorage.writeMockData(data)
    if (mockServer.isRunning()) mockServer.updateRoutes(data.routes)
  })

  ipcMain.handle(IPC.MOCK_START, async (_e, port: number, routes: MockRoute[]) => {
    const win = BrowserWindow.getAllWindows()[0]
    const actual = await mockServer.start(port, routes, (routeId, hitCount) => {
      scheduleMockRouteHit(win, routeId, hitCount)
    })
    return { port: actual }
  })

  ipcMain.handle(IPC.MOCK_STOP, async () => {
    await mockServer.stop()
  })
}
