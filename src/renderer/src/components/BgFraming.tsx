import { useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { CloseIcon } from './Icons'

/**
 * Non-destructive image framing: pan (object-position) + zoom (scale). Drives the
 * global framing state live, so the real background / avatar updates as you drag.
 * Handles two targets: the app background ('bg') and the profile avatar ('avatar').
 */
export function BgFraming(): JSX.Element {
  const t = useT()
  const target = usePlayer((s) => s.framingTarget)
  const customBg = usePlayer((s) => s.customBg)
  const bgPosX = usePlayer((s) => s.bgPosX)
  const bgPosY = usePlayer((s) => s.bgPosY)
  const bgZoom = usePlayer((s) => s.bgZoom)
  const avatar = usePlayer((s) => s.profileAvatar || s.scAuth?.avatar || null)
  const avPosX = usePlayer((s) => s.avPosX)
  const avPosY = usePlayer((s) => s.avPosY)
  const avZoom = usePlayer((s) => s.avZoom)
  const setBgFraming = usePlayer((s) => s.setBgFraming)
  const setAvatarFraming = usePlayer((s) => s.setAvatarFraming)
  const closeFraming = usePlayer((s) => s.closeFraming)

  const isAvatar = target === 'avatar'
  const img = isAvatar ? avatar : customBg
  const posX = isAvatar ? avPosX : bgPosX
  const posY = isAvatar ? avPosY : bgPosY
  const zoom = isAvatar ? avZoom : bgZoom
  const setFraming = isAvatar ? setAvatarFraming : setBgFraming

  const stageRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const [closing, setClosing] = useState(false)

  function requestClose(): void {
    setClosing(true)
    setTimeout(() => closeFraming(), 200)
  }

  const clamp = (v: number): number => Math.max(0, Math.min(100, v))

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    dragging.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging.current || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const dx = e.clientX - dragging.current.x
    const dy = e.clientY - dragging.current.y
    dragging.current = { x: e.clientX, y: e.clientY }
    // Read the latest value from the store (pointer events can outpace renders).
    // Drag image right → reveal more of the left → object-position decreases.
    const s = usePlayer.getState()
    const curX = isAvatar ? s.avPosX : s.bgPosX
    const curY = isAvatar ? s.avPosY : s.bgPosY
    setFraming({
      x: clamp(curX - (dx / rect.width) * 100),
      y: clamp(curY - (dy / rect.height) * 100)
    })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    dragging.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>): void {
    const s = usePlayer.getState()
    const cur = isAvatar ? s.avZoom : s.bgZoom
    const z = Math.max(1, Math.min(3, cur - e.deltaY * 0.0015))
    setFraming({ zoom: z })
  }

  // Background frames to the window aspect; the avatar frames to a square.
  const aspect = isAvatar ? '1 / 1' : `${window.innerWidth} / ${window.innerHeight}`

  return (
    <div
      className={`framing-overlay ${closing ? 'closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div className="framing-modal">
        <div className="framing-head">
          <div>
            <div className="framing-title">
              {isAvatar ? t('frameAvatar') : t('frameBackground')}
            </div>
            <div className="framing-hint">{t('frameHint')}</div>
          </div>
          <button className="icon-btn" onClick={requestClose} title={t('done')}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div
          ref={stageRef}
          className={`framing-stage ${isAvatar ? 'avatar' : ''}`}
          style={{ aspectRatio: aspect }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {img && (
            <img
              src={img}
              alt=""
              draggable={false}
              style={{ objectPosition: `${posX}% ${posY}%`, transform: `scale(${zoom})` }}
            />
          )}
          <div className={`framing-grid ${isAvatar ? 'circle' : ''}`} />
        </div>

        <div className="framing-controls">
          <span className="framing-zoom-label">{t('zoom')}</span>
          <input
            className="slider"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setFraming({ zoom: Number(e.target.value) })}
          />
          <button className="sync-btn ghost" onClick={() => setFraming({ x: 50, y: 50, zoom: 1 })}>
            {t('reset')}
          </button>
          <button className="sync-btn primary" onClick={requestClose}>
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}
