import { useRef, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { COARSE_POINTER } from '../touch'
import { CloseIcon } from './Icons'

/**
 * Non-destructive image framing: pan (object-position + a matching transform
 * origin) + zoom (scale). Drives the global framing state live, so the real
 * background / avatar updates as you drag. Handles three targets: an image app
 * background, an mp4 app background ('bg' + `bgKind`), and the profile avatar.
 *
 * The pan is EXACT — one finger/cursor pixel moves the image by one pixel. The
 * hidden strip on an axis is `zoom * displayed - frame` px wide (see `travel`
 * below), so a percentage point of `object-position` is worth
 * `travel / 100` px and not, as it used to be, a percent of the frame's own
 * width. With a landscape wallpaper in a portrait phone frame the strip is ~3x
 * the frame, which is why the old mapping made the image bolt sideways.
 */
export function BgFraming(): JSX.Element {
  const t = useT()
  const target = usePlayer((s) => s.framingTarget)
  const customBg = usePlayer((s) => s.customBg)
  const bgKind = usePlayer((s) => s.bgKind)
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
  // An mp4 background is framed the same way; only the element differs.
  const isVideo = !isAvatar && bgKind === 'video'
  const img = isAvatar ? avatar : customBg
  const posX = isAvatar ? avPosX : bgPosX
  const posY = isAvatar ? avPosY : bgPosY
  const zoom = isAvatar ? avZoom : bgZoom
  const setFraming = isAvatar ? setAvatarFraming : setBgFraming

  const stageRef = useRef<HTMLDivElement>(null)
  // Natural pixel size of the source, needed for the pan mapping. 0 until the
  // preview loads; the drag falls back to the frame size until then.
  const nat = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  // Live pointers on the stage: one = pan, two = pinch. `pinch` remembers the
  // spread and the zoom the gesture started from, so the zoom tracks the fingers
  // instead of accumulating rounding.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const [closing, setClosing] = useState(false)

  function requestClose(): void {
    setClosing(true)
    setTimeout(() => closeFraming(), 200)
  }

  const clamp = (v: number): number => Math.max(0, Math.min(100, v))
  const clampZoom = (v: number): number => Math.max(1, Math.min(3, v))

  /**
   * Screen px of image hidden on each axis at the current zoom — the distance
   * `object-position` 0% → 100% actually travels. `object-fit: cover` scales the
   * source by `max(frameW/natW, frameH/natH)`, then `scale(zoom)` magnifies that,
   * and the frame itself is what stays put. An axis whose displayed size equals
   * the frame has nothing to reveal, hence the 0.5px floor: no travel, no pan.
   */
  function travel(rect: DOMRect, z: number): { x: number; y: number } {
    const { w, h } = nat.current
    if (!w || !h) return { x: rect.width * z, y: rect.height * z }
    const cover = Math.max(rect.width / w, rect.height / h)
    return { x: w * cover * z - rect.width, y: h * cover * z - rect.height }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone */
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: liveZoom() }
    }
  }

  function liveZoom(): number {
    const s = usePlayer.getState()
    return isAvatar ? s.avZoom : s.bgZoom
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !stageRef.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const rect = stageRef.current.getBoundingClientRect()

    // Two fingers: pinch to zoom, anchored on the spread the gesture started at.
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      setFraming({ zoom: clampZoom((pinch.current.zoom * dist) / pinch.current.dist) })
      return
    }

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    // Read the latest value from the store (pointer events can outpace renders).
    // Drag image right → reveal more of the left → object-position decreases.
    const s = usePlayer.getState()
    const curX = isAvatar ? s.avPosX : s.bgPosX
    const curY = isAvatar ? s.avPosY : s.bgPosY
    const t = travel(rect, isAvatar ? s.avZoom : s.bgZoom)
    setFraming({
      x: t.x > 0.5 ? clamp(curX - (dx / t.x) * 100) : curX,
      y: t.y > 0.5 ? clamp(curY - (dy / t.y) * 100) : curY
    })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>): void {
    setFraming({ zoom: clampZoom(liveZoom() - e.deltaY * 0.0015) })
  }

  // Background frames to the window aspect; the avatar frames to a square.
  const aspect = isAvatar ? '1 / 1' : `${window.innerWidth} / ${window.innerHeight}`

  // The zoom scales about the framed point, not the centre, so the strip the
  // zoom hides moves with `object-position` too — that is what makes a zoomed
  // image pannable on BOTH axes even when the source's aspect matches the
  // frame's. Every place that paints a framed image/video does the same (App /
  // LyricsView / MobileApp / ProfilePage / Sidebar).
  const framed = {
    objectPosition: `${posX}% ${posY}%`,
    transformOrigin: `${posX}% ${posY}%`,
    transform: `scale(${zoom})`
  }

  return (
    <div
      className={`framing-overlay ${closing ? 'closing' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div className="framing-modal">
        <div className="framing-head">
          <div>
            <div className="framing-title">
              {isAvatar ? t('frameAvatar') : t('frameBackground')}
            </div>
            <div className="framing-hint">
              {COARSE_POINTER ? t('frameHintTouch') : t('frameHint')}
            </div>
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
          {img && isVideo && (
            <video
              src={img}
              autoPlay
              loop
              muted
              playsInline
              // `videoWidth/Height` is what `naturalWidth/Height` is for an
              // image — it is 0 until metadata lands, hence the same onLoad
              // hook, just a different event.
              onLoadedMetadata={(e) => {
                nat.current = {
                  w: e.currentTarget.videoWidth,
                  h: e.currentTarget.videoHeight
                }
              }}
              style={framed}
            />
          )}
          {img && !isVideo && (
            <img
              src={img}
              alt=""
              draggable={false}
              onLoad={(e) => {
                nat.current = {
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight
                }
              }}
              style={framed}
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

