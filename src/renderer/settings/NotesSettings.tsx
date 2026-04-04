import type { ObsidianSettings } from '../../shared/contracts'

type Props = {
  value: ObsidianSettings
  onChange: (next: ObsidianSettings) => void
}

export function NotesSettings({ value, onChange }: Props) {
  return (
    <>
      <p className="muted">Obsidian vault path</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          style={{ flex: 1 }}
          value={value.vaultPath}
          onChange={(e) => onChange({ ...value, vaultPath: e.target.value })}
        />
        <button
          type="button"
          onClick={async () => {
            const p = await window.ananke.dialog.pickDirectory()
            if (p) onChange({ ...value, vaultPath: p })
          }}
        >
          Browse
        </button>
      </div>
      <p className="muted">Subfolder inside vault</p>
      <input
        style={{ width: '100%', marginBottom: 12 }}
        value={value.subfolder}
        onChange={(e) => onChange({ ...value, subfolder: e.target.value })}
      />
    </>
  )
}
