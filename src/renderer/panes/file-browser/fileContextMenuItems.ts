import type { FileBrowserPaneState, ListDirEntry } from '../../../shared/contracts'
import { joinPath } from '../../lib/pathUtils'
import type { ContextMenuItem } from './ContextMenu'

type CtxMenu = { x: number; y: number; path: string; side: 'left' | 'right' }

type Args = {
  ctxMenu: CtxMenu
  leftEntries: ListDirEntry[]
  rightEntries: ListDirEntry[]
  pane: FileBrowserPaneState
  activateEntry: (side: 'left' | 'right', entry: ListDirEntry) => void
  openEditor: (readOnly: boolean) => void
  setRenaming: (r: { path: string; side: 'left' | 'right'; name: string }) => void
  refreshActive: () => void
  refreshBoth: () => void
  onUpdate: (next: FileBrowserPaneState) => void
  showPrompt: (label: string, onSubmit: (value: string) => void) => void
  setCopyOpen: (open: boolean) => void
  setMoveOpen: (open: boolean) => void
  setArchiveOpen: (open: boolean) => void
}

/** Build the right-click menu for a file-browser entry. Targets the clicked side explicitly. */
export function fileContextMenuItems({
  ctxMenu,
  leftEntries,
  rightEntries,
  pane,
  activateEntry,
  openEditor,
  setRenaming,
  refreshActive,
  refreshBoth,
  onUpdate,
  showPrompt,
  setCopyOpen,
  setMoveOpen,
  setArchiveOpen
}: Args): ContextMenuItem[] {
  const ctxSide = ctxMenu.side
  const ctxEntries = ctxSide === 'left' ? leftEntries : rightEntries
  const ctxActivePath = ctxSide === 'left' ? pane.leftPath : pane.rightPath
  const ctxSelection = ctxSide === 'left' ? [...pane.leftSelection] : [...pane.rightSelection]
  return [
    {
      label: 'Open', shortcut: 'Enter', onClick: () => {
        const entry = ctxEntries.find((e) => e.path === ctxMenu.path)
        if (entry) void activateEntry(ctxSide, entry)
      }
    },
    { label: 'Read', shortcut: 'F3', onClick: () => void openEditor(true) },
    { label: 'Edit', shortcut: 'F4', onClick: () => void openEditor(false) },
    {
      label: 'Rename', shortcut: 'F2', onClick: () => {
        const entry = ctxEntries.find(en => en.path === ctxMenu.path)
        if (entry) setRenaming({ path: entry.path, side: ctxSide, name: entry.name })
      }
    },
    { label: 'Copy Path', onClick: () => void window.ananke.clipboard.writeText(ctxMenu.path) },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Copy…', shortcut: 'F5', onClick: () => setCopyOpen(true) },
    { label: 'Move…', shortcut: 'F6', onClick: () => setMoveOpen(true) },
    { label: 'Archive…', onClick: () => setArchiveOpen(true) },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'New File', shortcut: 'Alt+F7', onClick: () => {
        showPrompt('New file name:', (name) => {
          void window.ananke.fs.createFile(joinPath(ctxActivePath, name))
            .then(() => refreshActive())
            .catch((err: Error) => alert(err.message))
        })
      }
    },
    {
      label: 'New Terminal Here', onClick: () => {
        const sel = ctxEntries.find(e => e.path === ctxMenu.path)
        const dir = sel?.isDirectory ? sel.path : ctxActivePath
        window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'terminal', cwd: dir } }))
      }
    },
    {
      label: 'New GitUI Here', onClick: () => {
        const sel = ctxEntries.find(e => e.path === ctxMenu.path)
        const dir = sel?.isDirectory ? sel.path : ctxActivePath
        window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'gitui', cwd: dir } }))
      }
    },
    ...(window.ananke.platform !== 'win32' ? [{
      label: 'Set Execute Permission', onClick: () => {
        void window.ananke.fs.chmod(ctxMenu.path, '755')
          .then(() => refreshActive())
          .catch((err: Error) => alert(err.message))
      }
    }] : []),
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Delete', shortcut: 'F8', danger: true, onClick: () => {
        if (!ctxSelection.length) return
        if (!confirm(`Delete ${ctxSelection.length} item(s)?`)) return
        void (async () => {
          await window.ananke.fs.quickOp('delete', '', ctxSelection)
          refreshBoth()
          onUpdate({
            ...pane,
            ...(ctxSide === 'left' ? { leftSelection: [] } : { rightSelection: [] })
          })
        })()
      }
    },
  ]
}
