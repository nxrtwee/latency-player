import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A thin overlay scrollbar that attaches to an EXISTING scroll element (unlike
 * CustomScroll, which owns its own scroll view). This lets panels keep their own
 * overflow box — and any list windowing hooked to it — while still getting the
 * same reveal-on-hover/scroll, draggable thumb as the center column.
 *
 * Usage: give the scroll element a ref, make its offset parent `position:relative`,
 * and drop `<OverlayScrollbar scrollRef={ref} />` as a sibling inside that parent.
 * The bar positions itself over the scroller via its offset within that parent.
 */
const PAD = 4

export function OverlayScrollbar({
  scrollRef
}: {
  scrollRef: React.RefObject<HTMLElement>
}): JSX.Element | null {
  const [thumb, setThumb] = useState({ top: 0, height: 0, show: false })
  const [box, setBox] = useState({ top: 0, left: 0, height: 0 })
  const [active, setActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [nearEdge, setNearEdge] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>()

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // Align the overlay bar to the scroller within its offset parent.
    setBox({ top: el.offsetTop, left: el.offsetLeft + el.clientWidth - 10, height: el.clientHeight })
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.show ? { ...t, show: false } : t))
      return
    }
    const trackH = clientHeight - PAD * 2
    const h = Math.max(32, (clientHeight / scrollHeight) * trackH)
    const top = PAD + (scrollTop / (scrollHeight - clientHeight)) * (trackH - h)
    setThumb({ top, height: h, show: true })
  }, [scrollRef])

  const flashActive = useCallback(() => {
    setActive(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setActive(false), 900)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    measure()
    const onScroll = (): void => {
      measure()
      flashActive()
    }
    const onMove = (e: MouseEvent): void => {
      const r = el.getBoundingClientRect()
      setNearEdge(r.right - e.clientX <= 22 && e.clientY >= r.top && e.clientY <= r.bottom)
    }
    const onLeave = (): void => setNearEdge(false)
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    // Sibling rows above the scroller (e.g. a filter input) can shift its offset.
    if (el.parentElement) ro.observe(el.parentElement)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      ro.disconnect()
    }
  }, [scrollRef, measure, flashActive])

  function startDrag(e: React.MouseEvent): void {
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const startY = e.clientY
    const startScroll = el.scrollTop
    const trackH = el.clientHeight - PAD * 2
    const ratio = (el.scrollHeight - el.clientHeight) / (trackH - thumb.height)
    setDragging(true)
    function move(ev: MouseEvent): void {
      el!.scrollTop = startScroll + (ev.clientY - startY) * ratio
    }
    function up(): void {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setDragging(false)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const reveal = nearEdge || active || dragging
  if (!thumb.show) return null
  return (
    <div
      className={`cscroll-ovl ${reveal ? 'reveal' : ''}`}
      style={{ top: box.top, left: box.left, height: box.height }}
    >
      <div
        className={`cscroll-thumb ${dragging ? 'dragging' : ''}`}
        style={{ top: thumb.top, height: thumb.height }}
        onMouseDown={startDrag}
      />
    </div>
  )
}
