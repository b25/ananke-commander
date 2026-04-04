import type { AppStateSnapshot, WorkspaceState } from '../../shared/contracts'

type Props = {
  snap: AppStateSnapshot
  ws: WorkspaceState
  onClose: () => void
  onSnapshot: (s: AppStateSnapshot) => void
}

export function RecentlyClosedPanel({ snap, ws, onClose, onSnapshot }: Props) {
  return (
    <>
      <h3>Recently closed</h3>
      <div className="body">
        {snap.recentlyClosed.length === 0 && <p className="muted">Empty</p>}
        {snap.recentlyClosed.map((e) => (
          <div
            key={e.id}
            style={{ marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}
          >
            <div className="muted">{e.snapshot.type}</div>
            <div style={{ fontSize: 11 }}>{e.snapshot.title}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() =>
                  void window.ananke.state.restoreClosed(ws.id, e.id).then(onSnapshot)
                }
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => void window.ananke.state.removeRecentlyClosed(e.id).then(onSnapshot)}
              >
                Forget
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  )
}
