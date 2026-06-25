import { useEffect, useRef, useState } from 'react'

interface Win {
  start: number
  end: number
}

/**
 * Lightweight fixed-height list windowing. Renders only the rows currently in
 * view (plus overscan) so a 300-track list mounts ~20 rows instead of 300 —
 * killing the tab-switch hitch and scroll jank.
 *
 * It hooks into whatever scroll ancestor the rows container sits in (the app's
 * CustomScroll `.cscroll-view`, or a panel's own overflow box like `.q-list`),
 * found via `scrollSelector`. Total height is preserved with top/bottom spacers
 * so the custom scrollbar still measures the real content size. Rows MUST be a
 * fixed `rowHeight` px tall (pin it in CSS) or the math drifts.
 *
 * Attach the returned `containerRef` to the element that directly holds the
 * spacers + visible rows, and that element must be a DESCENDANT of the scroller
 * (not the scroller itself) so its in-content offset can be measured.
 */
export function useVirtualRows(
  count: number,
  rowHeight: number,
  scrollSelector: string,
  overscan = 8
): { containerRef: React.RefObject<HTMLDivElement>; win: Win } {
  const containerRef = useRef<HTMLDivElement>(null)
  const [win, setWin] = useState<Win>(() => ({ start: 0, end: Math.min(count, 30) }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scroller = container.closest(scrollSelector) as HTMLElement | null
    if (!scroller) {
      // No windowing context — render everything (small lists / unexpected DOM).
      setWin({ start: 0, end: count })
      return
    }

    let raf = 0
    // Cached layout metrics: the rows container's offset within the scroll content
    // and the viewport height. Measured on resize only (forcing layout once),
    // never per scroll frame — the hot path then reads just scrollTop. Small drift
    // (e.g. a cover image loading above the list) is absorbed by `overscan`.
    let offset = 0
    let viewH = 0
    const measure = (): void => {
      const sRect = scroller.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      offset = cRect.top - sRect.top + scroller.scrollTop
      viewH = scroller.clientHeight
    }
    const compute = (): void => {
      raf = 0
      const first = Math.floor((scroller.scrollTop - offset) / rowHeight)
      const visible = Math.ceil(viewH / rowHeight)
      const start = Math.max(0, first - overscan)
      const end = Math.min(count, Math.max(0, first) + visible + overscan)
      setWin((p) => (p.start === start && p.end === end ? p : { start, end }))
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(compute)
    }
    const onResize = (): void => {
      measure()
      onScroll()
    }

    measure()
    compute()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(scroller)
    ro.observe(container)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [count, rowHeight, scrollSelector, overscan])

  return { containerRef, win }
}
