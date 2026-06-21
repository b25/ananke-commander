import { BrowserWindow, Menu, MenuItem, WebContentsView, app, clipboard, shell } from 'electron'
import type { BrowserNavigateResult } from '../../shared/contracts.js'
import { attachGuestWebContentsGuards, hardenGuestSession, isExternalUrlAllowed, isNavigationAllowed } from '../security/browserSecurity.js'
import { applyJsonPrettyPrint } from './browserJsonPrettyPrint.js'
import { BrowserHistoryService, type HistoryEntry, type HistoryOptions } from './browserHistoryService.js'
import { HarCaptureService } from './harCaptureService.js'

export type { HistoryEntry, HistoryOptions }

export class BrowserPaneManager {
  private mainWindow: BrowserWindow
  private views = new Map<string, WebContentsView>()
  private history: BrowserHistoryService
  private har = new HarCaptureService()
  private pendingNavigations = new Map<string, string>()
  /** Panes that have loaded a page at least once. Lets `ensureNavigated` stay idempotent
   *  across React remounts so switching workspace/screen never reloads a live page. */
  private loaded = new Set<string>()
  /** Panes explicitly parked offscreen (collapse / modal / non-active workspace). */
  private suspended = new Set<string>()
  /** Last applied bounds per pane (serialized) to skip redundant `setBounds` churn/flicker. */
  private lastBounds = new Map<string, string>()
  private jsonPrettyPrint = new Map<string, boolean>()
  private defaultJsonPrettyPrint = true

  constructor(mainWindow: BrowserWindow, historyOpts: HistoryOptions) {
    this.mainWindow = mainWindow
    this.history = new BrowserHistoryService(historyOpts)
  }

  getHistory(paneId: string): HistoryEntry[] {
    return this.history.get(paneId)
  }

  clearHistory(paneId: string): void {
    this.history.clear(paneId)
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
        this.history.append(id, navigatedUrl)
        if (!win.isDestroyed())
          win.webContents.send('browser:urlUpdate', { paneId: id, url: navigatedUrl })
      })
      view.webContents.on('did-navigate-in-page', (_e, navigatedUrl) => {
        this.history.append(id, navigatedUrl)
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
        void this.applyJsonPrettyPrintForPane(id)
      })
      view.webContents.on('context-menu', (_e, params) => {
        this.showContextMenu(id, view!, params)
      })
      this.mainWindow.contentView.addChildView(view)
      this.views.set(paneId, view)
      const pending = this.pendingNavigations.get(paneId)
      if (pending && isNavigationAllowed(pending)) {
        this.pendingNavigations.delete(paneId)
        this.loaded.add(paneId)
        void view.webContents.loadURL(pending)
      }
    }
    // A layout to real (on-screen) bounds is a restore; the offscreen sentinel is a suspend.
    if (bounds.x <= -9999) {
      this.suspend(paneId)
      return
    }
    this.suspended.delete(paneId)
    this.applyBounds(paneId, view, bounds)
  }

  /** Apply bounds, skipping the IPC/native work when nothing changed. */
  private applyBounds(paneId: string, view: WebContentsView, bounds: Electron.Rectangle): void {
    const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
    if (this.lastBounds.get(paneId) === key) return
    this.lastBounds.set(paneId, key)
    view.setBounds(bounds)
  }

  setJsonPrettyPrint(paneId: string, enabled: boolean): void {
    this.jsonPrettyPrint.set(paneId, enabled)
    void this.applyJsonPrettyPrintForPane(paneId)
  }

  getJsonPrettyPrint(paneId: string): boolean {
    return this.jsonPrettyPrint.get(paneId) ?? this.defaultJsonPrettyPrint
  }

  setDefaultJsonPrettyPrint(enabled: boolean): void {
    this.defaultJsonPrettyPrint = enabled
  }

  private async applyJsonPrettyPrintForPane(paneId: string): Promise<void> {
    const view = this.views.get(paneId)
    if (!view || view.webContents.isDestroyed()) return
    const enabled = this.getJsonPrettyPrint(paneId)
    const run = async () => {
      const result = await applyJsonPrettyPrint(view.webContents, enabled)
      if (result === 'reload') view.webContents.reload()
      return result
    }
    const first = await run()
    if (enabled && first !== true) {
      for (const delay of [120, 350, 700]) {
        setTimeout(() => void run(), delay)
      }
    }
  }

  navigate(paneId: string, url: string): BrowserNavigateResult {
    if (!isNavigationAllowed(url)) {
      this.pendingNavigations.delete(paneId)
      return { status: 'blocked', url }
    }
    const view = this.views.get(paneId)
    if (!view) {
      this.pendingNavigations.set(paneId, url)
      this.loaded.add(paneId)
      return { status: 'pending' }
    }
    this.pendingNavigations.delete(paneId)
    this.loaded.add(paneId)
    void view.webContents.loadURL(url)
    return { status: 'ok' }
  }

  /**
   * Load `url` only if this pane has never loaded a page. Idempotent across React remounts
   * (workspace/screen switches), so a live page is never reloaded just because its owning
   * component re-mounted. Explicit user navigation still goes through `navigate`.
   */
  ensureNavigated(paneId: string, url: string): BrowserNavigateResult {
    if (this.loaded.has(paneId)) return { status: 'ok' }
    return this.navigate(paneId, url)
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
    this.har.start(paneId, view.webContents)
  }

  harStop(paneId: string): void {
    this.har.stop(paneId)
  }

  harGetData(paneId: string): object | null {
    return this.har.getData(paneId)
  }

  harIsRecording(paneId: string): boolean {
    return this.har.isRecording(paneId)
  }

  harGetEntryCount(paneId: string): number {
    return this.har.getEntryCount(paneId)
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
          if (isExternalUrlAllowed(url)) void shell.openExternal(url)
        }
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    // Link actions
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open Link in System Browser',
        click: () => { if (isExternalUrlAllowed(params.linkURL)) void shell.openExternal(params.linkURL) }
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

    if (!app.isPackaged) {
      menu.append(new MenuItem({
        label: 'Inspect Element',
        click: () => { wc.inspectElement(params.x, params.y) }
      }))
    }

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
      wc.executeJavaScript('document.body.innerText.slice(0, 8192)').catch(() => '')
    ])
    return { title, url, selectedText, bodyText }
  }

  suspend(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    // Move offscreen but keep the view alive — preserves page state,
    // session cookies, scroll position, and form data.
    this.suspended.add(paneId)
    this.applyBounds(paneId, view, { x: -9999, y: -9999, width: 10, height: 10 })
  }

  /** Suspend every live browser view whose pane is not in `keepPaneIds`. Called on
   *  workspace switch so views from non-active workspaces can never bleed on-screen. */
  suspendAllExcept(keepPaneIds: string[]): void {
    const keep = new Set(keepPaneIds)
    for (const id of this.views.keys()) {
      if (!keep.has(id)) this.suspend(id)
    }
  }

  isSuspended(paneId: string): boolean {
    return this.suspended.has(paneId)
  }

  hasSuspended(paneId: string): boolean {
    return this.views.has(paneId)
  }

  destroy(paneId: string): void {
    const view = this.views.get(paneId)
    if (!view) return
    this.har.delete(paneId)
    this.history.delete(paneId)
    this.pendingNavigations.delete(paneId)
    this.jsonPrettyPrint.delete(paneId)
    this.loaded.delete(paneId)
    this.suspended.delete(paneId)
    this.lastBounds.delete(paneId)
    if (!this.mainWindow.isDestroyed()) {
      try { this.mainWindow.contentView.removeChildView(view) } catch {}
    }
    if (!view.webContents.isDestroyed()) {
      // Drop the per-view listeners attached in `layout()` before closing the WebContents.
      try { view.webContents.removeAllListeners() } catch {}
      try { view.webContents.close() } catch {}
    }
    this.views.delete(paneId)
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id)
  }
}
