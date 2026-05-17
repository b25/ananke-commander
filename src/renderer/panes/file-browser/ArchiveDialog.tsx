import { useState } from 'react'

type Props = {
  onClose: () => void
  onPack: (format: 'zip' | 'tgz', outFile: string) => Promise<void>
  onUnpack: (format: 'zip' | 'tgz', archivePath: string, outDir: string) => Promise<void>
  suggestedPackPath: string
  defaultUnpackDir: string
}

export function ArchiveDialog({ onClose, onPack, onUnpack, suggestedPackPath, defaultUnpackDir }: Props) {
  const [mode, setMode] = useState<'pack' | 'unpack'>('pack')
  const [format, setFormat] = useState<'zip' | 'tgz'>('zip')
  const [path, setPath] = useState(suggestedPackPath)
  const [targetDir, setTargetDir] = useState(defaultUnpackDir)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="archive-dialog-title">Archive (v1: ZIP and .tar.gz only)</h2>
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
        <label className="muted" htmlFor="archive-format">Format</label>
        <select id="archive-format" value={format} onChange={(e) => setFormat(e.target.value as 'zip' | 'tgz')} style={{ width: '100%', marginBottom: 8 }}>
          <option value="zip">ZIP</option>
          <option value="tgz">tar.gz (.tgz)</option>
        </select>
        {mode === 'pack' ? (
          <>
            <label className="muted" htmlFor="archive-path">Output file</label>
            <input id="archive-path" autoFocus value={path} onChange={(e) => setPath(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          </>
        ) : (
          <>
            <label className="muted" htmlFor="archive-path">Archive file</label>
            <input id="archive-path" autoFocus value={path} onChange={(e) => setPath(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <label className="muted" htmlFor="archive-target-dir">Extract to folder</label>
            <input id="archive-target-dir" value={targetDir} onChange={(e) => setTargetDir(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          </>
        )}
        {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
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
                  const dest = targetDir.trim() || defaultUnpackDir.trim()
                  if (!dest) {
                    setErr('Choose a destination folder for extraction.')
                    setBusy(false)
                    return
                  }
                  if (
                    !confirm(
                      'Extracting may overwrite existing files in the target folder. Continue?'
                    )
                  ) {
                    setBusy(false)
                    return
                  }
                  await onUnpack(format, path, dest)
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
