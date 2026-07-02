/**
 * Feather-style inline-SVG pane icons (UX-13).
 * All icons: 24×24 viewBox, stroke="currentColor", fill="none", strokeWidth=2,
 * rounded caps/joins — inheriting theme color via currentColor.
 */

import type { PaneType } from '../../shared/contracts'

interface SvgProps {
  size?: number
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

const STROKE: React.SVGAttributes<SVGSVGElement> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function base(size: number, children: React.ReactNode, extra?: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...STROKE}
      {...extra}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

// Folder — file-browser
export function FileBrowserIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// Terminal prompt — terminal
export function TerminalIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// Globe — browser
export function BrowserIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// File-text — notes
export function NotesIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </>
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// Activity waveform — radar
export function RadarIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// Git-branch — gitui
export function GitUiIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

// Tool/wrench — api-toolkit
export function ApiToolkitIcon({ size = 12, ...rest }: SvgProps) {
  return base(size, (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ), rest as React.SVGAttributes<SVGSVGElement>)
}

/** Single component driven by PaneType — the primary export for call sites. */
export function PaneIcon({ type, size = 12 }: { type: PaneType; size?: number }) {
  const props = { size, 'aria-hidden': true as const }
  switch (type) {
    case 'file-browser': return <FileBrowserIcon {...props} />
    case 'terminal':     return <TerminalIcon {...props} />
    case 'browser':      return <BrowserIcon {...props} />
    case 'notes':        return <NotesIcon {...props} />
    case 'radar':        return <RadarIcon {...props} />
    case 'gitui':        return <GitUiIcon {...props} />
    case 'api-toolkit':  return <ApiToolkitIcon {...props} />
  }
}
