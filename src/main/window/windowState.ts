import { app, screen, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import Store from 'electron-store'
import { join } from 'node:path'
import { backupCorruptFile } from '../store/storeRecovery.js'

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 840
const MIN_WIDTH = 640
const MIN_HEIGHT = 480

export type PersistedWindowState = {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
  devToolsOpen?: boolean
}

type WindowStateStoreSchema = {
  mainWindow: PersistedWindowState | null
}

// SEC-3: clearInvalidConfig resets to defaults on bad JSON instead of throwing.
// The try/catch backs up the corrupt file and starts fresh so createWindow() can
// always succeed even when ananke-window-state.json is unreadable.
function createWindowStore(): Store<WindowStateStoreSchema> {
  const name = 'ananke-window-state'
  const defaults: WindowStateStoreSchema = { mainWindow: null }
  try {
    return new Store<WindowStateStoreSchema>({ name, defaults, clearInvalidConfig: true })
  } catch {
    backupCorruptFile(join(app.getPath('userData'), `${name}.json`))
    return new Store<WindowStateStoreSchema>({ name, defaults })
  }
}

const windowStore = createWindowStore()

/** Bounds that intersect at least one display work area (handles monitor changes). */
export function ensureVisibleOnScreen(state: PersistedWindowState): PersistedWindowState {
  const width = Math.max(MIN_WIDTH, state.width)
  const height = Math.max(MIN_HEIGHT, state.height)
  const rect = { x: state.x, y: state.y, width, height }

  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      rect.x < area.x + area.width &&
      rect.x + rect.width > area.x &&
      rect.y < area.y + area.height &&
      rect.y + rect.height > area.y
    )
  })

  if (visible) return { ...state, width, height }

  const primary = screen.getPrimaryDisplay().workArea
  return {
    x: primary.x + Math.max(0, Math.round((primary.width - width) / 2)),
    y: primary.y + Math.max(0, Math.round((primary.height - height) / 2)),
    width: Math.min(width, primary.width),
    height: Math.min(height, primary.height),
    isMaximized: false
  }
}

export function getMainWindowCreateOptions(): BrowserWindowConstructorOptions {
  const saved = windowStore.get('mainWindow')
  if (!saved) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  const bounds = ensureVisibleOnScreen(saved)
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false
  }
}

function readBounds(win: BrowserWindow, allowDevTools: boolean): PersistedWindowState {
  const isMaximized = win.isMaximized()
  const b = isMaximized ? win.getNormalBounds() : win.getBounds()
  const state: PersistedWindowState = {
    x: b.x,
    y: b.y,
    width: Math.max(MIN_WIDTH, b.width),
    height: Math.max(MIN_HEIGHT, b.height),
    isMaximized
  }
  if (allowDevTools) {
    state.devToolsOpen = win.webContents.isDevToolsOpened()
  }
  return state
}

function persistWindowState(win: BrowserWindow, allowDevTools: boolean): void {
  if (win.isDestroyed()) return
  const prev = windowStore.get('mainWindow')
  const next = readBounds(win, allowDevTools)
  if (!allowDevTools && prev?.devToolsOpen !== undefined) {
    next.devToolsOpen = prev.devToolsOpen
  }
  windowStore.set('mainWindow', next)
}

/** Save size/position on move, resize, maximize; restore maximized once when shown. */
export function attachMainWindowStatePersistence(win: BrowserWindow, allowDevTools: boolean): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => persistWindowState(win, allowDevTools), 400)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  if (allowDevTools) {
    win.webContents.on('devtools-opened', scheduleSave)
    win.webContents.on('devtools-closed', scheduleSave)
  }
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    persistWindowState(win, allowDevTools)
  })

  const saved = windowStore.get('mainWindow')
  win.once('ready-to-show', () => {
    if (saved?.isMaximized) win.maximize()
    win.show()
  })
}

/** Open DevTools on startup when they were open last session (dev builds only). */
export function restoreMainWindowDevTools(win: BrowserWindow, allowDevTools: boolean): void {
  if (!allowDevTools || win.isDestroyed()) return
  if (windowStore.get('mainWindow')?.devToolsOpen) {
    win.webContents.openDevTools()
  }
}
