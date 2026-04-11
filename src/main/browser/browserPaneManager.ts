import { BrowserWindow, Menu, MenuItem, WebContentsView, clipboard, shell } from 'electron'
import Store from 'electron-store'
import { attachGuestWebContentsGuards, hardenGuestSession, isNavigationAllowed } from '../security/browserSecurity.js'
import { HarCapture } from './harCapture.js'

export type HistoryEntry = { url: string; timestamp: number }

type HistoryStoreSchema = { histories: Record<string, HistoryEntry[]> }

type HistoryOptions = {
  maxEntries: () => number
  shouldRecord: () => boolean
  onHistory: (paneId: string, entries: HistoryEntry[]) => void
}

export class BrowserPaneManager {
  private mainWindow: BrowserWindow
  private views = new Map<string, WebContentsView>()
  private histories = new Map<string, HistoryEntry[]>()
  private harCaptures = new Map<string, HarCapture>()
  private historyOpts: HistoryOptions
  private historyStore: Store<HistoryStoreSchema>
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(mainWindow: BrowserWindow, historyOpts: HistoryOptions) {
    this.mainWindow = mainWindow
    this.historyOpts = historyOpts
    this.historyStore = new Store<HistoryStoreSchema>({
      name: 'ananke-browser-history',
      defaults: { histories: {} }
    })
    // Restore persisted history into memory
    const saved = this.historyStore.get('histories', {})
    for (const [paneId, entries] of Object.entries(saved)) {
      if (Array.isArray(entries) && entries.length > 0) {
        this.histories.set(paneId, entries)
      }
    }
  }

  private persistHistory(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      const obj: Record<string, HistoryEntry[]> = {}
      for (const [id, entries] of this.histories) {
        if (entries.length > 0) obj[id] = entries
      }
      this.historyStore.set('histories', obj)
    }, 1000) // Debounce 1s
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
    if (h.length === 0 || h[h.length - 1].url !== url) {
      h = [...h, { url, timestamp: Date.now() }]
    }
    h = h.slice(-max)
    this.histories.set(paneId, h)
    this.historyOpts.onHistory(paneId, h)
    this.persistHistory()
  }

  getHistory(paneId: string): HistoryEntry[] {
    return [...(this.histories.get(paneId) ?? [])]
  }

  clearHistory(paneId: string): void {
    this.histories.set(paneId, [])
    this.historyOpts.onHistory(paneId, [])
    this.persistHistory()
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
        if (!win.isDestroyed())
          win.webContents.send('browser:urlUpdate', { paneId: id, url: navigatedUrl })
      })
      view.webContents.on('did-navigate-in-page', (_e, navigatedUrl) => {
        this.appendHistory(id, navigatedUrl)
        if (!win.isDestroyed())
          win.webContents.send('browser:urlUpdate', { paneId: id, url: navigatedUrl })
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
      view.webContents.on('context-menu', (_e, params) => {
        this.showContextMenu(id, view!, params)
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

  harStart(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    let capture = this.harCaptures.get(paneId)
    if (!capture) {
      capture = new HarCapture()
      this.harCaptures.set(paneId, capture)
    }
    capture.start(view.webContents)
  }

  harStop(paneId: string): void {
    this.harCaptures.get(paneId)?.stop()
  }

  harGetData(paneId: string): object | null {
    return this.harCaptures.get(paneId)?.getHar() ?? null
  }

  harIsRecording(paneId: string): boolean {
    return this.harCaptures.get(paneId)?.isRecording ?? false
  }

  harGetEntryCount(paneId: string): number {
    return this.harCaptures.get(paneId)?.entryCount ?? 0
  }

  openDevTools(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    view.webContents.openDevTools({ mode: 'detach' })
  }

  setZoom(paneId: string, delta: number): number {
    const view = this.views.get(paneId)
    if (!view) return 1
    const current = view.webContents.getZoomFactor()
    const next = Math.max(0.25, Math.min(5, current + delta))
    view.webContents.setZoomFactor(next)
    return next
  }

  resetZoom(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    view.webContents.setZoomFactor(1)
  }

  findInPage(paneId: string, text: string, forward: boolean): void {
    const view = this.views.get(paneId)
    if (!view || !text) return
    view.webContents.findInPage(text, { forward })
  }

  stopFindInPage(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    view.webContents.stopFindInPage('clearSelection')
  }

  private showContextMenu(paneId: string, view: WebContentsView, params: Electron.ContextMenuParams): void {
    const wc = view.webContents
    const menu = new Menu()

    // Text editing actions
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut }))
      menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }))
      menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste }))
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }))
      menu.append(new MenuItem({ type: 'separator' }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }))
      menu.append(new MenuItem({
        label: `Search Google for "${params.selectionText.slice(0, 30)}${params.selectionText.length > 30 ? '...' : ''}"`,
        click: () => {
          const url = 'https://www.google.com/search?q=' + encodeURIComponent(params.selectionText)
          void wc.loadURL(url)
        }
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Link actions
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open Link in System Browser',
        click: () => { if (isNavigationAllowed(params.linkURL)) void shell.openExternal(params.linkURL) }
      }))
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL)
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Image actions
    if (params.mediaType === 'image' && params.srcURL) {
      menu.append(new MenuItem({
        label: 'Copy Image Address',
        click: () => clipboard.writeText(params.srcURL)
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Navigation
    menu.append(new MenuItem({ label: 'Back', click: () => wc.goBack(), enabled: wc.canGoBack() }))
    menu.append(new MenuItem({ label: 'Forward', click: () => wc.goForward(), enabled: wc.canGoForward() }))
    menu.append(new MenuItem({ label: 'Reload', click: () => wc.reload() }))
    menu.append(new MenuItem({ type: 'separator' }))

    // Save to vault
    menu.append(new MenuItem({
      label: 'Save Page to Obsidian Vault',
      click: () => {
        if (!this.mainWindow.isDestroyed())
          this.mainWindow.webContents.send('browser:clipToVault', { paneId })
      }
    }))
    menu.append(new MenuItem({ type: 'separator' }))

    // DevTools
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => { wc.inspectElement(params.x, params.y) }
    }))

    menu.popup()
  }

  async getPageInfo(paneId: string): Promise<{ title: string; url: string; selectedText: string; bodyText: string } | null> {
    const view = this.views.get(paneId)
    if (!view || view.webContents.isDestroyed()) return null
    const wc = view.webContents
    const [title, url, selectedText, bodyText] = await Promise.all([
      wc.executeJavaScript('document.title').catch(() => ''),
      wc.executeJavaScript('window.location.href').catch(() => ''),
      wc.executeJavaScript('window.getSelection().toString()').catch(() => ''),
      wc.executeJavaScript('document.body.innerText.slice(0, 50000)').catch(() => '')
    ])
    return { title, url, selectedText, bodyText }
  }

  suspend(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    // Move offscreen but keep the view alive — preserves page state,
    // session cookies, scroll position, and form data.
    view.setBounds({ x: -9999, y: -9999, width: 10, height: 10 })
  }

  hasSuspended(paneId: string): boolean {
    return this.views.has(paneId)
  }

  destroy(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    this.harCaptures.get(paneId)?.stop()
    this.harCaptures.delete(paneId)
    this.histories.delete(paneId)
    this.persistHistory()
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
