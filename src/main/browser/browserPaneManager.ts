import { BrowserWindow, WebContentsView } from 'electron'
import { attachGuestWebContentsGuards, hardenGuestSession, isNavigationAllowed } from '../security/browserSecurity.js'

type HistoryOptions = {
  maxEntries: () => number
  shouldRecord: () => boolean
  onHistory: (paneId: string, urls: string[]) => void
}

export class BrowserPaneManager {
  private mainWindow: BrowserWindow
  private views = new Map<string, WebContentsView>()
  private histories = new Map<string, string[]>()
  private historyOpts: HistoryOptions

  constructor(mainWindow: BrowserWindow, historyOpts: HistoryOptions) {
    this.mainWindow = mainWindow
    this.historyOpts = historyOpts
  }

  private appendHistory(paneId: string, url: string): void {
    if (!this.historyOpts.shouldRecord()) return
    if (!isNavigationAllowed(url)) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
    } catch {
      return
    }
    const max = Math.max(1, this.historyOpts.maxEntries())
    let h = this.histories.get(paneId) ?? []
    if (h[h.length - 1] !== url) h = [...h, url]
    h = h.slice(-max)
    this.histories.set(paneId, h)
    this.historyOpts.onHistory(paneId, h)
  }

  getHistory(paneId: string): string[] {
    return [...(this.histories.get(paneId) ?? [])]
  }

  layout(paneId: string, bounds: Electron.Rectangle): void {
    let view = this.views.get(paneId)
    if (!view) {
      view = new WebContentsView({
        webPreferences: {
          partition: `persist:guest-${paneId}`,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true
        }
      })
      hardenGuestSession(view.webContents.session)
      attachGuestWebContentsGuards(view.webContents)
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      const id = paneId
      const win = this.mainWindow
      view.webContents.on('did-navigate', (_e, navigatedUrl) => {
        this.appendHistory(id, navigatedUrl)
      })
      view.webContents.on('page-title-updated', (_e, title) => {
        if (!win.isDestroyed())
          win.webContents.send('browser:titleUpdate', { paneId: id, title })
      })
      view.webContents.on('did-start-loading', () => {
        if (!win.isDestroyed())
          win.webContents.send('browser:loadingState', { paneId: id, loading: true })
      })
      view.webContents.on('did-stop-loading', () => {
        if (!win.isDestroyed())
          win.webContents.send('browser:loadingState', { paneId: id, loading: false })
      })
      this.mainWindow.contentView.addChildView(view)
      this.views.set(paneId, view)
    }
    view.setBounds(bounds)
  }

  navigate(paneId: string, url: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    const target = isNavigationAllowed(url) ? url : 'about:blank'
    void view.webContents.loadURL(target)
  }

  goBack(paneId: string): void {
    this.views.get(paneId)?.webContents.goBack()
  }

  goForward(paneId: string): void {
    this.views.get(paneId)?.webContents.goForward()
  }

  stop(paneId: string): void {
    this.views.get(paneId)?.webContents.stop()
  }

  reload(paneId: string): void {
    this.views.get(paneId)?.webContents.reload()
  }

  destroy(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    this.histories.delete(paneId)
    if (!this.mainWindow.isDestroyed()) {
      try { this.mainWindow.contentView.removeChildView(view) } catch {}
    }
    if (!view.webContents.isDestroyed()) {
      try { view.webContents.close() } catch {}
    }
    this.views.delete(paneId)
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id)
  }
}
