import type { AppStateSnapshot } from '../../shared/contracts'
import { NotesSettings } from '../settings/NotesSettings'
import { PrivacySettings } from '../settings/PrivacySettings'

const DEFAULT_TERMINAL = { fontSize: 10, fontFamily: 'ui-monospace, monospace', scrollback: 10_000 }

type Props = {
  snap: AppStateSnapshot
  setSnap: (next: AppStateSnapshot) => void
  onClose: () => void
  onEditToml: () => void
  onCopyDebugInfo: () => void
  onRepairWorkspace: () => void
}

/** Settings drawer: Obsidian, terminal prefs, privacy, TOML editor entry points, diagnostics. */
export function SettingsDrawer({ snap, setSnap, onClose, onEditToml, onCopyDebugInfo, onRepairWorkspace }: Props) {
  return (
    <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-drawer-title">
      <h3 id="settings-drawer-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Settings
        <button type="button" aria-label="Close settings" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '16px', padding: 0 }}>✕</button>
      </h3>
      <div className="body">
        <NotesSettings value={snap.settings.obsidian} onChange={(obsidian) => setSnap({ ...snap, settings: { ...snap.settings, obsidian } })} />
        <div style={{ marginBottom: 12 }}>
          <label className="muted" htmlFor="terminal-font-size" style={{ marginBottom: 4, display: 'block' }}>Terminal font size</label>
          <input id="terminal-font-size" type="number" min={6} max={32} value={snap.settings.terminal?.fontSize ?? 10} onChange={(e) => {
            const terminal = { ...snap.settings.terminal ?? DEFAULT_TERMINAL, fontSize: Math.max(6, Math.min(32, Number(e.target.value) || 10)) }
            setSnap({ ...snap, settings: { ...snap.settings, terminal } })
          }} style={{ width: 60, marginRight: 12 }} />
          <label className="muted" htmlFor="terminal-scrollback" style={{ marginBottom: 4, marginTop: 8, display: 'block' }}>Terminal scrollback (xterm lines)</label>
          <input id="terminal-scrollback" type="number" min={100} max={50000} value={snap.settings.terminal?.scrollback ?? 10_000} onChange={(e) => {
            const terminal = { ...snap.settings.terminal ?? DEFAULT_TERMINAL, scrollback: Math.max(100, Math.min(50_000, Number(e.target.value) || 10_000)) }
            setSnap({ ...snap, settings: { ...snap.settings, terminal } })
          }} style={{ width: 100 }} />
          <label className="muted" htmlFor="terminal-font-family" style={{ marginBottom: 4, marginTop: 8, display: 'block' }}>Terminal font family</label>
          <input id="terminal-font-family" type="text" value={snap.settings.terminal?.fontFamily ?? 'ui-monospace, monospace'} onChange={(e) => {
            const terminal = { ...snap.settings.terminal ?? DEFAULT_TERMINAL, fontFamily: e.target.value }
            setSnap({ ...snap, settings: { ...snap.settings, terminal } })
          }} style={{ width: '100%' }} />
        </div>
        <PrivacySettings value={snap.settings.privacy} onChange={(privacy) => setSnap({ ...snap, settings: { ...snap.settings, privacy } })} onPurgeRecentlyClosed={() => void window.ananke.state.purgeRecentlyClosed().then(setSnap)} />
        <button type="button" className="primary" onClick={() => void window.ananke.state.set({ settings: snap.settings }).then(setSnap)}>Save settings</button>
        <hr style={{ margin: '12px 0', borderColor: 'var(--border)' }} />
        <div style={{ fontSize: 10, marginBottom: 6, color: 'var(--muted)' }}>Workspace File (TOML)</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="primary" onClick={onEditToml}>Edit TOML</button>
          <button type="button" onClick={() => void window.ananke.config.openToml()}>Open in System Editor</button>
          <button type="button" onClick={() => void window.ananke.config.writeToml()}>Force Save</button>
        </div>
        <hr style={{ margin: '12px 0', borderColor: 'var(--border)' }} />
        <div style={{ fontSize: 10, marginBottom: 6, color: 'var(--muted)' }}>Diagnostics</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={onCopyDebugInfo}>Copy Debug Info</button>
          <button type="button" onClick={onRepairWorkspace}>Repair Workspace</button>
        </div>
      </div>
    </aside>
  )
}
