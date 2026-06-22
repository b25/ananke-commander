import { ipcMain } from 'electron'
import { IPC } from '../../../shared/api-toolkit-contracts.js'
import type { HttpRequest } from '../../../shared/api-toolkit-contracts.js'
import { sendHttp, cancelHttp } from '../http-client.js'

/** HTTP request send / cancel. */
export function registerHttpIpc(): void {
  ipcMain.handle(IPC.HTTP_SEND, async (_e, id: string, req: HttpRequest) => {
    try {
      return await sendHttp(id, req)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // Map common Node/undici network errors to user-facing messages
      const userMessage = msg.includes('ECONNREFUSED')
        ? `Connection refused — is the server running at ${req.url}?`
        : msg.includes('ETIMEDOUT') || msg.includes('timed out')
          ? `Request timed out after ${req.timeout > 0 ? req.timeout : 30000}ms`
          : msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')
            ? `Could not resolve host — check the URL`
            : msg
      throw new Error(userMessage)
    }
  })
  ipcMain.on(IPC.HTTP_CANCEL, (_e, id: string) => cancelHttp(id))
}
