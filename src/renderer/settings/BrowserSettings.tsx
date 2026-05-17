import type { BrowserSettings as BrowserSettingsValue } from '../../shared/contracts'

type Props = {
  value: BrowserSettingsValue
  onChange: (next: BrowserSettingsValue) => void
}

export function BrowserSettings({ value, onChange }: Props) {
  const text = (value.extraAllowedHosts ?? []).join('\n')

  return (
    <>
      <p className="muted">Embedded browser — extra allowed hosts (one per line)</p>
      <p className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
        Built-in: localhost, 127.0.0.1, example.com. Add hosts like <code>github.com</code> or{' '}
        <code>https://docs.npmjs.com</code>. Save settings to apply.
      </p>
      <textarea
        rows={4}
        style={{ width: '100%', marginBottom: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        value={text}
        placeholder={'github.com\nnpmjs.com'}
        spellCheck={false}
        onChange={(e) => {
          const extraAllowedHosts = e.target.value
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
          onChange({ ...value, extraAllowedHosts })
        }}
      />
    </>
  )
}
