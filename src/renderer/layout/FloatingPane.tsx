interface Props {
  x: number
  y: number
  width: number
  height: number
  isActive: boolean
  isCollapsed?: boolean
  onActivate: () => void
  children: React.ReactNode
}

export function FloatingPane({ x, y, width, height, isActive, isCollapsed, onActivate, children }: Props) {
  return (
    <div
      className={`floating-pane${isActive ? ' active' : ''}`}
      style={{ position: 'absolute', left: x, top: y, width, height, zIndex: isActive ? 10 : 1, display: isCollapsed ? 'none' : undefined }}
      onMouseDown={isCollapsed ? undefined : onActivate}
    >
      {children}
    </div>
  )
}
