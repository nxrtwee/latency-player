import type React from 'react'

// Targets that must keep their native mouse behaviour — never start a grab on
// these (typing, range sliders, native drag-and-drop reorder, color canvas).
const SKIP = 'input, textarea, select, [contenteditable="true"], [draggable="true"], [role="slider"], canvas, .slider'

const MOVE_THRESHOLD = 6

/**
 * Phone-style grab-to-scroll. Attach as `onMouseDown` to a scroll container: hold
 * LMB and drag to scroll it. Moves scrollTop on the main thread, so it never
 * triggers the backdrop-filter wheel-repaint freeze (unlike the mouse wheel).
 *
 * Clicks still work: we only take over once the pointer moves past a small
 * threshold, and we swallow the trailing click ONLY after a real drag — so a
 * tap on a button/row fires normally. Form controls, sliders and native drag
 * handles are skipped so typing / sliders / queue-reorder keep working.
 */
export function grabScroll(e: React.MouseEvent<HTMLElement>): void {
  if (e.button !== 0) return
  const el = e.currentTarget
  if (el.scrollHeight <= el.clientHeight + 1) return // nothing to scroll
  if ((e.target as HTMLElement).closest(SKIP)) return

  const startX = e.clientX
  const startY = e.clientY
  const startTop = el.scrollTop
  let dragging = false

  const move = (ev: MouseEvent): void => {
    const dy = ev.clientY - startY
    if (!dragging) {
      if (Math.abs(dy) < MOVE_THRESHOLD && Math.abs(ev.clientX - startX) < MOVE_THRESHOLD) return
      dragging = true
      el.classList.add('grabbing')
    }
    el.scrollTop = startTop - dy
  }
  const up = (): void => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up, true)
    el.classList.remove('grabbing')
    if (dragging) {
      // Cancel the click that fires after a drag so we don't also activate a row.
      const swallow = (ce: MouseEvent): void => {
        ce.stopPropagation()
        ce.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, true))
    }
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up, true)
}
