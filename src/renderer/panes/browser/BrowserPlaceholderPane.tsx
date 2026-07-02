import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { BrowserActions } from './BrowserActions'
import { BrowserFindBar } from './BrowserFindBar'
import { BrowserToolbar } from './BrowserToolbar'
import {
  loadBrowserJsonPrettyPrint,
  paneJsonPrettyPrint,
  saveBrowserJsonPrettyPrint,
} from './browserJsonPrettyPrintPrefs'
import { ConfirmModal } from '../../components/ConfirmModal'
import { showToast } from '../../components/useToast'

type Props = {
  pane: BrowserPaneState
  isActive: boolean
  isCollapsed?: boolean
  canvasOffset: { x: number; y: number }
  onClose: () => void
  onUpdate: (next: BrowserPaneState) => void
}

export function BrowserPlaceholderPane({ pane, isActive, isCollapsed, canvasOffset, onClose, onUpdate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  type HistoryEntry = { url: string; timestamp: number }
  const [navHistory, setNavHistory] = useState<HistoryEntry[]>([])
  const [urlInput, setUrlInput] = useState(() => urlForOmnibox(pane.url))
  const [loading, setLoading] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [navError, setNavError] = useState<string | null>(null)
  const [jsonPrettyPrint, setJsonPrettyPrint] = useState(() => paneJsonPrettyPrint(pane))
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message?: string; tone?: 'default' | 'destructive'; confirmLabel?: string; onConfirm: () => void
  } | null>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const focusBeforeFindRef = useRef<HTMLElement | null>(null)

  const closeFind = () => {
    setFindOpen(false)
    void window.ananke.browser.stopFindInPage(pane.id)
    const restore = focusBeforeFindRef.current
    focusBeforeFindRef.current = null
    if (restore?.isConnected) restore.focus()
    else urlRef.current?.focus()
  }

  const openFind = () => {
    focusBeforeFindRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setFindOpen(true)
    setTimeout(() => findRef.current?.focus(), 50)
  }

  // Keep a ref to the latest pane so IPC callbacks never use stale closures
  const paneRef = useRef(pane)
  paneRef.current = pane
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    setUrlInput(urlForOmnibox(pane.url))
  }, [pane.url])

  useEffect(() => {
    const enabled = paneJsonPrettyPrint(pane)
    setJsonPrettyPrint(enabled)
    void window.ananke.browser.setJsonPrettyPrint(pane.id, enabled)
  }, [pane.id, pane.jsonPrettyPrint])

  useEffect(() => {
    if (!loading && jsonPrettyPrint) {
      void window.ananke.browser.setJsonPrettyPrint(pane.id, true)
    }
  }, [loading, jsonPrettyPrint, pane.id])

  useEffect(() => {
    void window.ananke.browser.getHistory(pane.id).then(setNavHistory)
    const unsub = window.ananke.browser.onHistory(({ paneId, entries }) => {
      if (paneId === pane.id) setNavHistory(entries)
    })
    const unsubTitle = window.ananke.browser.onTitleUpdate(({ paneId, title }) => {
      if (paneId === pane.id) onUpdateRef.current({ ...paneRef.current, title })
    })
    const unsubLoading = window.ananke.browser.onLoadingState(({ paneId, loading: l }) => {
      if (paneId === pane.id) setLoading(l)
    })
    const unsubUrl = window.ananke.browser.onUrlUpdate(({ paneId, url }) => {
      if (paneId === pane.id) {
        setUrlInput(urlForOmnibox(url))
        onUpdateRef.current({ ...paneRef.current, url })
      }
    })
    const unsubClip = window.ananke.browser.onClipToVault(({ paneId }) => {
      if (paneId === pane.id) void clipPageToVault(pane.id)
    })
    return () => {
      unsub()
      unsubTitle()
      unsubLoading()
      unsubUrl()
      unsubClip()
    }
  }, [pane.id])

  useEffect(() => {
    const target = pane.url?.trim() || 'about:blank'
    if (target === 'about:blank') return
    void (async () => {
      // ensureNavigated only loads when the native view has not loaded a page yet, so a
      // remount (workspace/screen switch) re-syncs bounds without reloading the live page.
      const result = await window.ananke.browser.ensureNavigated(pane.id, target)
      if (result.status === 'blocked') {
        setNavError(blockedHostMessage(result.url))
      }
    })()
  }, [pane.id]) // Intentionally only on pane ID change / fresh component mount

  const nativeVisibleRef = useRef(true)
  const isCollapsedRef = useRef(isCollapsed ?? false)
  isCollapsedRef.current = isCollapsed ?? false

  // Coalesce the many bounds-sync triggers (ResizeObserver, window resize, visibility/modal
  // events) into one native setBounds per animation frame. `syncBounds` is redefined every
  // render, so we call the latest copy via a ref.
  const syncBoundsRef = useRef<() => void>(() => {})
  const rafRef = useRef<number | null>(null)
  const scheduleSync = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      syncBoundsRef.current()
    })
  }, [])

  useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => {
      nativeVisibleRef.current = e.detail
      scheduleSync()
    }
    window.addEventListener('native-view-visibility', handler as EventListener)
    return () => window.removeEventListener('native-view-visibility', handler as EventListener)
  }, [scheduleSync])

  // When collapse state changes, suspend or restore the native view explicitly.
  // This replaces the unmount/remount lifecycle so the page is never reloaded.
  useEffect(() => {
    if (isCollapsed) {
      void window.ananke.browser.suspend(pane.id)
    } else {
      syncBounds()
    }
  // syncBounds is redefined each render; capturing it via ref is intentional here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed, pane.id])

  const syncBounds = () => {
    const el = hostRef.current
    if (!el) return
    // When pane is collapsed the FloatingPane has display:none — native view must stay offscreen.
    if (isCollapsedRef.current) {
      void window.ananke.browser.suspend(pane.id)
      return
    }
    const r = el.getBoundingClientRect()
    
    // In Ananke, native WebContentsViews float above the Chromium compositor and ignore CSS `overflow: clip`.
    // If the canvas pans out of bounds, the bounds reflect negative coordinates and the View overlays the toolbar!
    // We must manually intersect the DOM element's bounds with the canvas workspace container limits.
    const container = el.closest('.canvas-workspace')
    let isVisible = nativeVisibleRef.current

    if (container && isVisible) {
      const cr = container.getBoundingClientRect()
      const intersectRight = Math.min(r.right, cr.right)
      const intersectBottom = Math.min(r.bottom, cr.bottom)
      const intersectX = Math.max(r.x, cr.x)
      const intersectY = Math.max(r.y, cr.y)

      const intersectW = intersectRight - intersectX
      const intersectH = intersectBottom - intersectY

      if (intersectW <= 0 || intersectH <= 0) {
        isVisible = false
      } else {
        // Feed the rigidly cropped coordinates directly to Electron layout.
        // This physically prevents Native Views from bleeding over the top menu Toolbar during any panning behavior.
        const bounds = {
          x: Math.round(intersectX),
          y: Math.round(intersectY),
          width: Math.round(Math.max(intersectW, 120)),
          height: Math.round(Math.max(intersectH, 120))
        }
        void window.ananke.browser.layout(pane.id, bounds)
        return
      }
    }

    if (!isVisible) {
      void window.ananke.browser.layout(pane.id, { x: -9999, y: -9999, width: 10, height: 10 })
      return
    }

    const bounds = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(Math.max(r.width, 120)),
      height: Math.round(Math.max(r.height, 120))
    }
    void window.ananke.browser.layout(pane.id, bounds)
  }
  syncBoundsRef.current = syncBounds

  // Re-sync on mount, active change, pane move/resize, canvas pan, and collapse state.
  // useLayoutEffect fires synchronously before paint — ensures the native view is
  // suspended before the browser composites the frame when collapsing.
  useLayoutEffect(() => {
    syncBounds()
  }, [pane.id, isActive, isCollapsed, pane.x, pane.y, pane.width, pane.height, canvasOffset.x, canvasOffset.y])

  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleSync())
    const el = hostRef.current
    if (el) ro.observe(el)
    window.addEventListener('resize', scheduleSync)
    // Hide native view while any renderer modal is open (WebContentsViews paint
    // above all CSS z-index; only moving them off-screen fixes the overlap).
    const onModalOpen = () => void window.ananke.browser.suspend(pane.id)
    const onModalClose = () => scheduleSync()
    window.addEventListener('ananke:modal-open', onModalOpen)
    window.addEventListener('ananke:modal-close', onModalClose)
    return () => {
      ro.disconnect()
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('ananke:modal-open', onModalOpen)
      window.removeEventListener('ananke:modal-close', onModalClose)
      // Suspend (hide offscreen) instead of destroy — keeps the page alive
      // when pane is collapsed. Actual destroy happens via explicit close.
      void window.ananke.browser.suspend(pane.id)
    }
  }, [pane.id, scheduleSync])

  // Keyboard shortcuts when this pane is active
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'l') { e.preventDefault(); urlRef.current?.focus(); urlRef.current?.select() }
      if (mod && e.key === 'r') { e.preventDefault(); void window.ananke.browser.reload(pane.id) }
      if (mod && e.key === 'f') { e.preventDefault(); setFindOpen(true); setTimeout(() => findRef.current?.focus(), 50) }
      if (mod && e.shiftKey && e.key === 'I') { e.preventDefault(); void window.ananke.browser.openDevTools(pane.id) }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); void window.ananke.browser.setZoom(pane.id, 0.1) }
      if (mod && e.key === '-') { e.preventDefault(); void window.ananke.browser.setZoom(pane.id, -0.1) }
      if (mod && e.key === '0') { e.preventDefault(); void window.ananke.browser.resetZoom(pane.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, pane.id])

  const clipPageToVault = async (id: string) => {
    const snap = await window.ananke.state.get()
    const { vaultPath, subfolder } = snap.settings.obsidian
    if (!vaultPath) {
      showToast('Set Obsidian vault path in Settings first.')
      return
    }
    const info = await window.ananke.browser.getPageInfo(id)
    if (!info) return
    const content = info.selectedText || info.bodyText.slice(0, 20000)
    const date = new Date().toISOString()
    const wsIdx = snap.workspaces.findIndex(w => w.id === snap.activeWorkspaceId)
    const wsName = snap.workspaces[wsIdx]?.name || 'Workspace'
    const wsLabel = `${wsIdx + 1}-${wsName}`
    const safeTitle = (info.title || 'Untitled').replace(/[/\\:*?"<>|]/g, '-')
    const body = [
      '---',
      `title: "${info.title}"`,
      `workspace: "${wsLabel}"`,
      `url: ${info.url}`,
      `date: ${date}`,
      `tags: [web-clipper]`,
      '---',
      '',
      `# ${info.title}`,
      '',
      content
    ].join('\n')

    setConfirmModal({
      title: 'Save to Vault',
      message: `Save "${info.title || 'Untitled'}" to Obsidian vault?`,
      confirmLabel: 'Save',
      onConfirm: () => {
        setConfirmModal(null)
        void window.ananke.notes.saveVault(vaultPath, subfolder, safeTitle, body)
          .then(() => showToast(`Saved to vault: ${subfolder}/${safeTitle}.md`, 'info'))
      }
    })
  }

  const looksLikeUrl = (input: string): boolean => {
    if (input.includes(' ')) return false
    // IP address (v4)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(input)) return true
    // Has a dot followed by at least 2 chars (domain-like: example.com, foo.co.uk)
    if (/\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input)) return true
    // Contains port number (e.g. myhost:3000)
    if (/^[a-zA-Z0-9_-]+(:\d+)(\/.*)?$/.test(input)) return true
    return false
  }

  const doNav = async (u: string) => {
    let target = u.trim() || 'about:blank'
    if (target === 'about:blank') {
      setNavError(null)
      return
    }
    if (/^(https?:\/\/|data:)/.test(target)) {
      // Already has protocol
    } else if (/^localhost(:\d+)?/.test(target)) {
      target = 'http://' + target
    } else if (looksLikeUrl(target)) {
      target = 'https://' + target
    } else {
      target = 'https://www.google.com/search?q=' + encodeURIComponent(target)
    }
    const result = await window.ananke.browser.navigate(pane.id, target)
    if (result.status === 'blocked') {
      setNavError(blockedHostMessage(result.url))
      return
    }
    setNavError(null)
    onUpdate({ ...pane, url: target })
    setUrlInput(target)
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader 
        title={pane.title} 
        paneType="browser" 
        onClose={onClose} 
        actions={<BrowserActions navHistory={navHistory} pane={pane} onUpdate={onUpdate} />}
      />
      <div className="pane-body browser-pane-body">
        <BrowserToolbar
          paneId={pane.id}
          loading={loading}
          urlInput={urlInput}
          urlRef={urlRef}
          onUrlInputChange={(value) => setUrlInput(value)}
          onSubmit={() => void doNav(urlInput)}
          onBack={() => window.ananke.browser.goBack(pane.id)}
          onForward={() => window.ananke.browser.goForward(pane.id)}
          onStop={() => window.ananke.browser.stop(pane.id)}
          onReload={() => void window.ananke.browser.reload(pane.id)}
          onOpenExternal={() => void window.ananke.shell.openExternal(pane.url)}
          onFindToggle={() => (findOpen ? closeFind() : openFind())}
          onClipToVault={() => void clipPageToVault(pane.id)}
        />
        <label className="browser-json-pretty" title="Pretty-print JSON responses (saved across refresh)">
          <input
            type="checkbox"
            checked={jsonPrettyPrint}
            onChange={(e) => {
              const enabled = e.target.checked
              setJsonPrettyPrint(enabled)
              saveBrowserJsonPrettyPrint(enabled)
              onUpdate({ ...pane, jsonPrettyPrint: enabled })
              void window.ananke.browser.setJsonPrettyPrint(pane.id, enabled)
            }}
          />
          Pretty-print
        </label>
        {navError && (
          <div className="browser-nav-error" role="alert">
            {navError}
          </div>
        )}
        {findOpen && (
          <BrowserFindBar
            findText={findText}
            findRef={findRef}
            onSubmit={() => void window.ananke.browser.findInPage(pane.id, findText, true)}
            onFindTextChange={(value) => {
              setFindText(value)
              if (value) void window.ananke.browser.findInPage(pane.id, value, true)
            }}
            onFindNext={() => void window.ananke.browser.findInPage(pane.id, findText, true)}
            onFindPrev={() => void window.ananke.browser.findInPage(pane.id, findText, false)}
            onClose={closeFind}
          />
        )}
        {loading && <div className="browser-loading-bar" />}
        <div ref={hostRef} className="browser-host" />
      </div>
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          tone={confirmModal.tone}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}

function urlForOmnibox(url: string | undefined): string {
  const u = (url ?? '').trim()
  if (!u || u === 'about:blank' || u === 'about:blank/') return ''
  return u
}

function blockedHostMessage(url: string): string {
  return `Navigation blocked (only http/https URLs are allowed): ${url}`
}
