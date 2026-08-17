import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { formatTime } from '../util'
import { useVirtualRows } from '../useVirtualRows'
import { coverOf } from '../cover'
import { SearchIcon, CloseIcon } from './Icons'

/** How long a finger must rest on a row before it's picked up for reordering. */
const LONG_PRESS_MS = 380
/** Movement that big before the timer fires means "scroll", not "pick up". */
const SLOP_PX = 9

/**
 * The phone player's lower half: the upcoming queue, the one thing the desktop
 * draws in the right panel that the phone has nowhere else.
 *
 * It is NOT a second player: art, title, waveform, prev/play/next and the
 * like/shuffle/repeat trio all live in the fullscreen player above it
 * (LyricsView), so this only fills the space under the transport. Which is why it
 * reuses the right panel's own class names (`rp-card queue`, `q-*`) rather than
 * new ones — the rows, filter and empty states are already styled, on both skins,
 * and portrait.css only retunes sizes and drops the card's frame (a card inside a
 * full-screen player is a border around nothing).
 *
 * Rendered only on touch (LyricsView gates it behind COARSE_POINTER): on desktop
 * the right panel is one click away and the fullscreen player is karaoke.
 *
 * No volume slider: a phone has hardware keys for that and the OS draws its own
 * overlay, so an in-app slider is a second, less precise control for something
 * the user does not adjust from this screen.
 *
 * Reordering is a long-press drag (HTML5 drag events never fire from a finger, so
 * the desktop's `draggable` rows are dead here): hold a row, move, release. The
 * queue's own scrolling is what makes this delicate, hence the slop check before
 * pick-up and the non-passive touchmove that blocks the scroll during the drag.
 */
export function FsQueue(): JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const clearUpcoming = usePlayer((s) => s.clearUpcoming)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const reorderQueue = usePlayer((s) => s.reorderQueue)
  const customCovers = usePlayer((s) => s.customCovers)
  const compact = usePlayer((s) => s.compact)

  const t = useT()

  const [filter, setFilter] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Upcoming tracks keep their absolute queue index so jump/remove stay correct
  // after filtering (same contract as RightPanel).
  const upcoming = (currentIndex >= 0 ? queue.slice(currentIndex + 1) : []).map((tr, i) => ({
    track: tr,
    absIndex: currentIndex + 1 + i
  }))
  const fq = filter.trim().toLowerCase()
  const shown = fq
    ? upcoming.filter(
        ({ track: tr }) =>
          tr.title.toLowerCase().includes(fq) || (tr.artist || '').toLowerCase().includes(fq)
      )
    : upcoming

  // Stride = row height + its 2px bottom margin, as in the right panel.
  const Q_ROW = compact ? 48 : 52
  const { containerRef: qRef, win } = useVirtualRows(shown.length, Q_ROW, '.q-list')

  // --- long-press reorder ------------------------------------------------------
  // `from`/`over` are absolute queue indices; `dy` moves the held row under the
  // finger. A pending press is a ref, not state, so the timer can be cancelled
  // without re-rendering the list on every touch.
  const [drag, setDrag] = useState<{ from: number; over: number; dy: number } | null>(null)
  const press = useRef<{ timer: number; y: number; x: number; from: number } | null>(null)
  const grabY = useRef(0)
  // A drop must not also count as "play this track": the click lands after the
  // pointer is up, so it's swallowed once.
  const swallowClick = useRef(false)

  function cancelPress(): void {
    if (press.current) {
      window.clearTimeout(press.current.timer)
      press.current = null
    }
  }

  function onRowPointerDown(e: React.PointerEvent, absIndex: number): void {
    if (e.pointerType === 'mouse' || drag) return // desktop keeps HTML5 drag
    cancelPress()
    const { clientX: x, clientY: y } = e
    const timer = window.setTimeout(() => {
      press.current = null
      grabY.current = y
      setDrag({ from: absIndex, over: absIndex, dy: 0 })
      // Android confirms the pick-up with a tick; iOS ignores this silently.
      navigator.vibrate?.(12)
    }, LONG_PRESS_MS)
    press.current = { timer, x, y, from: absIndex }
  }

  function onRowPointerMove(e: React.PointerEvent): void {
    const p = press.current
    if (!p) return
    if (Math.abs(e.clientY - p.y) > SLOP_PX || Math.abs(e.clientX - p.x) > SLOP_PX) cancelPress()
  }

  // While a row is held, the window owns the gesture: the held row is out of the
  // hit-test (pointer-events: none in portrait.css), so the row under the finger
  // is whatever elementFromPoint reports — no arithmetic against the virtual
  // window's spacers. touchmove is bound non-passive to keep the list from
  // scrolling out from under the drag; a `touch-action` switch would come too
  // late, the browser fixes that at touchstart.
  useEffect(() => {
    if (!drag) return
    const stopScroll = (ev: TouchEvent): void => ev.preventDefault()
    const move = (ev: PointerEvent): void => {
      const row = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('.q-item') as HTMLElement | null
      const abs = row?.dataset.abs ? Number(row.dataset.abs) : null
      setDrag((d) => (d ? { ...d, dy: ev.clientY - grabY.current, over: abs ?? d.over } : d))
    }
    const drop = (): void => {
      if (drag.over !== drag.from) reorderQueue(drag.from, drag.over)
      endDrag()
    }
    // A cancel is the system taking the gesture away (notification shade, an
    // incoming call): the finger never chose a slot, so nothing moves.
    const abort = (): void => endDrag()
    function endDrag(): void {
      setDrag(null)
      swallowClick.current = true
      window.setTimeout(() => {
        swallowClick.current = false
      }, 350)
    }
    document.addEventListener('touchmove', stopScroll, { passive: false })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', abort)
    return () => {
      document.removeEventListener('touchmove', stopScroll)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', abort)
    }
  }, [drag, reorderQueue])

  return (
    <div className="fs-queue">
      <div className="rp-card queue">
        <div className="rp-head">
          <span>{t('nextInQueue')}</span>
          {upcoming.length > 0 && (
            <button className="rp-clear" onClick={clearUpcoming}>
              {t('clear')}
            </button>
          )}
        </div>

        {/* The queue shares the screen with the player now, so the filter has to
            earn its 36px: it appears once the list is long enough to be worth
            filtering, and stays while a filter is active (otherwise a shrinking
            queue could leave "no matches" with no way to clear it). */}
        {(upcoming.length > 6 || filter) && (
          <div className="q-filter">
            <SearchIcon size={14} />
            <input
              value={filter}
              placeholder={t('filterQueue')}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="q-filter-clear" onClick={() => setFilter('')} title={t('clear')}>
                <CloseIcon size={12} />
              </button>
            )}
          </div>
        )}

        <div className={`q-list ${drag ? 'dnd' : ''}`} ref={listRef}>
          {upcoming.length === 0 && <div className="q-empty">{t('queueEmpty')}</div>}
          {upcoming.length > 0 && shown.length === 0 && (
            <div className="q-empty">{t('noQueueMatch')}</div>
          )}
          {shown.length > 0 && (
            <div className="q-window" ref={qRef}>
              {win.start > 0 && <div style={{ height: win.start * Q_ROW, flexShrink: 0 }} />}
              {shown.slice(win.start, win.end).map(({ track: tr, absIndex }) => (
                <div
                  key={`${tr.id}-${absIndex}`}
                  className={`q-item ${drag?.from === absIndex ? 'dragging' : ''} ${
                    drag && drag.over === absIndex && drag.from !== absIndex ? 'drag-over' : ''
                  }`}
                  data-abs={absIndex}
                  style={
                    drag?.from === absIndex
                      ? { transform: `translateY(${drag.dy}px)` }
                      : undefined
                  }
                  onPointerDown={(e) => onRowPointerDown(e, absIndex)}
                  onPointerMove={onRowPointerMove}
                  onPointerUp={cancelPress}
                  onPointerCancel={cancelPress}
                  onClick={() => {
                    if (swallowClick.current) return
                    jumpTo(absIndex)
                  }}
                  title={`Play ${tr.title}`}
                >
                  <div className="q-thumb">
                    {coverOf(tr, customCovers) ? (
                      <img src={coverOf(tr, customCovers)} alt="" />
                    ) : (
                      <span>♫</span>
                    )}
                  </div>
                  <div className="q-meta">
                    <span className="q-title">{tr.title}</span>
                    <span className="q-artist">{tr.artist || 'Unknown artist'}</span>
                  </div>
                  <span className="q-time">{formatTime(tr.durationSec ?? 0)}</span>
                  <button
                    className="q-remove"
                    title={t('removeFromQueue')}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (swallowClick.current) return
                      removeFromQueue(absIndex)
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
              {win.end < shown.length && (
                <div style={{ height: (shown.length - win.end) * Q_ROW, flexShrink: 0 }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
