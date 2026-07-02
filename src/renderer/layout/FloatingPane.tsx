interface Props {
  x: number
  y: number
  width: number
  height: number
  isActive: boolean
  isCollapsed?: boolean
  ariaLabel?: string
  onActivate: () => void
  children: React.ReactNode
}

export function FloatingPane({ x, y, width, height, isActive, isCollapsed, ariaLabel, onActivate, children }: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`floating-pane${isActive ? ' active' : ''}`}
      style={{ position: 'absolute', left: x, top: y, width, height, zIndex: isActive ? 'var(--z-elevated)' : 'var(--z-base)', display: isCollapsed ? 'none' : undefined }}
      onMouseDown={isCollapsed || isActive ? undefined : onActivate}
    >
      {children}
    </div>
  )
}
