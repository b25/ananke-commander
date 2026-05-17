import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Shown at the end of the strip (e.g. + new tab). */
  trailing?: ReactNode
  /** Scroll active item into view when this key changes. */
  scrollKey?: string | null
  className?: string
  trackClassName?: string
  /** Visual density for many items. */
  compact?: boolean
  ariaLabel?: string
}

const SCROLL_STEP = 160

export function ScrollableTabStrip({
  children,
  trailing,
  scrollKey,
  className = '',
  trackClassName = '',
  compact = false,
  ariaLabel
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: false })

  const updateEdges = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const overflow = scrollWidth > clientWidth + 1
    setEdge({
      left: overflow && scrollLeft > 2,
      right: overflow && scrollLeft < scrollWidth - clientWidth - 2
    })
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateEdges()
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    el.addEventListener('scroll', updateEdges, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateEdges)
    }
  }, [updateEdges, children])

  useEffect(() => {
    if (!scrollKey || !trackRef.current) return
    const active = trackRef.current.querySelector<HTMLElement>('[data-scroll-active="true"]')
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    requestAnimationFrame(updateEdges)
  }, [scrollKey, updateEdges])

  const scrollBy = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  const onWheel = (e: React.WheelEvent) => {
    const el = trackRef.current
    if (!el || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
    if (el.scrollWidth <= el.clientWidth) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  return (
    <div
      className={`tab-strip ${compact ? 'tab-strip--compact' : ''} ${className}`.trim()}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="tab-strip__nav tab-strip__nav--prev"
        aria-label="Scroll tabs left"
        disabled={!edge.left}
        onClick={() => scrollBy(-SCROLL_STEP)}
      >
        ‹
      </button>

      <div
        ref={trackRef}
        className={`tab-strip__track ${trackClassName}`.trim()}
        onWheel={onWheel}
      >
        {children}
      </div>

      <button
        type="button"
        className="tab-strip__nav tab-strip__nav--next"
        aria-label="Scroll tabs right"
        disabled={!edge.right}
        onClick={() => scrollBy(SCROLL_STEP)}
      >
        ›
      </button>

      {trailing}
    </div>
  )
}
