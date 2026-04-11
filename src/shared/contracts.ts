export type PaneType = 'file-browser' | 'terminal' | 'browser' | 'notes' | 'radar'

export interface PrivacySettings {
  terminalHistoryMax: number
  browserHistoryMax: number
  notesUndoMax: number
  recentlyClosedMax: number
  privateMode: boolean
}

export interface ObsidianSettings {
  vaultPath: string
  subfolder: string
}

export interface AppSettings {
  privacy: PrivacySettings
  obsidian: ObsidianSettings
}

export interface PaneStateBase {
  id: string
  type: PaneType
  title: string
  needsAttention?: boolean
  // Absolute pixel values — derived from fractions at render time
  x: number
  y: number
  width: number
  height: number
  // Proportional position as fractions of one viewport dimension.
  // x/yPct range 0–2 (4 screens); w/hPct range 0–1.
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

export interface FileBrowserPaneState extends PaneStateBase {
  type: 'file-browser'
  leftPath: string
  rightPath: string
  focusedSide: 'left' | 'right'
  leftSelection: string[]
  rightSelection: string[]
}

export interface TerminalPaneState extends PaneStateBase {
  type: 'terminal'
  cwd: string
}

export interface BrowserPaneState extends PaneStateBase {
  type: 'browser'
  url: string
}

export interface NotesPaneState extends PaneStateBase {
  type: 'notes'
  body: string
  currentFile?: string
}

export interface RadarPaneState extends PaneStateBase {
  type: 'radar'
  rootPath: string
  pathHistory: string[]
}

export type PaneState =
  | FileBrowserPaneState
  | TerminalPaneState
  | BrowserPaneState
  | NotesPaneState
  | RadarPaneState

export interface RecentlyClosedEntry {
  id: string
  closedAt: number
  snapshot: PaneState
}

export interface WorkspaceState {
  id: string
  name: string
  panes: PaneState[]
  activePaneId: string | null
  canvasOffset: { x: number; y: number }
  /** Active layout ID per screen index (0=TL,1=TR,2=BL,3=BR). Empty = auto. */
  screenLayouts: Record<number, string>
  /** User's explicitly chosen layout per screen — never auto-changed by resize. */
  intentLayouts: Record<number, string>
  /** Pane IDs collapsed to the strip per screen index. */
  screenCollapsed: Record<number, string[]>
}

export interface AppStateSnapshot {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string
  settings: AppSettings
  recentlyClosed: RecentlyClosedEntry[]
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  terminalHistoryMax: 500,
  browserHistoryMax: 200,
  notesUndoMax: 100,
  recentlyClosedMax: 50,
  privateMode: false
}

export const DEFAULT_SETTINGS: AppSettings = {
  privacy: DEFAULT_PRIVACY,
  obsidian: { vaultPath: '', subfolder: 'ananke-commander-notes' }
}

export interface ListDirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export interface FileJobProgress {
  jobId: string
  phase: string
  done: number
  total: number
  current?: string
}

export type FileJobKind = 'copy' | 'move' | 'delete'

export interface FileJobPayload {
  jobId: string
  kind: FileJobKind
  sources: string[]
  destDir?: string
}

export interface FolderSizeRequest {
  requestId: string
  dirPath: string
}

export interface FolderSizeProgress {
  requestId: string
  dirPath: string
  partialSize: number
  filesScanned: number
}

export interface FolderSizeDone {
  requestId: string
  dirPath: string
  totalSize: number
}

export interface FolderSizeError {
  requestId: string
  dirPath: string
  message: string
}
