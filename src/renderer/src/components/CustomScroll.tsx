import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A thin custom overlay scrollbar. Native scrollbars are hidden globally, so
 * this reserves no space (no seam) and never flashes on mount. The thumb shows
 * while hovering the area or scrolling, and is draggable.
 */
export function CustomScroll({ children }: { children: ReactNode }): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState({ top: 0, height: 0, show: false })
  const [active, setActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [nearEdge, setNearEdge] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>()

  const PAD = 4

  const measure = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => ({ ...t, show: false }))
      return
    }
    const trackH = clientHeight - PAD * 2
    const h = Math.max(32, (clientHeight / scrollHeight) * trackH)
    const top = PAD + (scrollTop / (scrollHeight - clientHeight)) * (trackH - h)
    setThumb({ top, height: h, show: true })
  }, [])

  const flashActive = useCallback(() => {
    setActive(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setActive(false), 900)
  }, [])

  const onScroll = useCallback(() => {
    measure()
    flashActive()
  }, [measure, flashActive])

  useEffect(() => {
    measure()
    const view = viewRef.current
    const content = contentRef.current
    if (!view || !content) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(view)
    ro.observe(content)
    return () => ro.disconnect()
  }, [measure])

  function startDrag(e: React.MouseEvent): void {
    e.preventDefault()
    const el = viewRef.current
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

  function onMouseMove(e: React.MouseEvent): void {
    const r = rootRef.current
    if (!r) return
    setNearEdge(r.getBoundingClientRect().right - e.clientX <= 22)
  }

  const reveal = nearEdge || active || dragging

  return (
    <div
      className={`cscroll ${reveal ? 'reveal' : ''}`}
      ref={rootRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setNearEdge(false)}
    >
      <div className="cscroll-view" ref={viewRef} onScroll={onScroll}>
        <div className="cscroll-content" ref={contentRef}>
          {children}
        </div>
      </div>
      <div className="cscroll-bar">
        {thumb.show && (
          <div
            className={`cscroll-thumb ${dragging ? 'dragging' : ''}`}
            style={{ top: thumb.top, height: thumb.height }}
            onMouseDown={startDrag}
          />
        )}
      </div>
    </div>
  )
}
