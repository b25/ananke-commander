import { useState } from 'react'

type Props = {
  onClose: () => void
  onPack: (format: 'zip' | 'tgz', outFile: string) => Promise<void>
  onUnpack: (format: 'zip' | 'tgz', archivePath: string, outDir: string) => Promise<void>
  suggestedPackPath: string
}

export function ArchiveDialog({ onClose, onPack, onUnpack, suggestedPackPath }: Props) {
  const [mode, setMode] = useState<'pack' | 'unpack'>('pack')
  const [format, setFormat] = useState<'zip' | 'tgz'>('zip')
  const [path, setPath] = useState(suggestedPackPath)
  const [targetDir, setTargetDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Archive (v1: ZIP and .tar.gz only)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          zstd, lzma/xz, brotli are planned for a later release.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={mode === 'pack' ? 'primary' : ''} onClick={() => setMode('pack')}>
            Pack
          </button>
          <button type="button" className={mode === 'unpack' ? 'primary' : ''} onClick={() => setMode('unpack')}>
            Unpack
          </button>
        </div>
        <label className="muted">Format</label>
        <select value={format} onChange={(e) => setFormat(e.target.value as 'zip' | 'tgz')} style={{ width: '100%', marginBottom: 8 }}>
          <option value="zip">ZIP</option>
          <option value="tgz">tar.gz (.tgz)</option>
        </select>
        {mode === 'pack' ? (
          <>
            <label className="muted">Output file</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          </>
        ) : (
          <>
            <label className="muted">Archive file</label>
            <input value={path} onChange={(e) => setPath(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <label className="muted">Extract to folder</label>
            <input value={targetDir} onChange={(e) => setTargetDir(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          </>
        )}
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setErr(null)
              setBusy(true)
              try {
                if (mode === 'pack') await onPack(format, path)
                else {
                  if (
                    !confirm(
                      'Extracting may overwrite existing files in the target folder. Continue?'
                    )
                  ) {
                    setBusy(false)
                    return
                  }
                  await onUnpack(format, path, targetDir || '.')
                }
                onClose()
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
