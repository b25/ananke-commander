import type { AppStateSnapshot, RecentlyClosedEntry, WorkspaceState } from '../../shared/contracts'

type Props = {
  recentlyClosed: RecentlyClosedEntry[]
  ws: WorkspaceState
  onClose: () => void
  onSnapshot: (s: AppStateSnapshot) => void
}

export function RecentlyClosedPanel({ recentlyClosed, ws, onClose, onSnapshot }: Props) {
  return (
    <>
      <div className="body">
        {recentlyClosed.length === 0 && <p className="muted">Empty</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {recentlyClosed.map((e) => (
            <li
              key={e.id}
              style={{ marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}
            >
              <div className="muted">{e.snapshot.type}</div>
              <div style={{ fontSize: 10 }}>{e.snapshot.title}</div>
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
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  )
}
