// Reusable image framing modal — drag to pan, slider to zoom. Saves
// object-position (%) + zoom (scale) applied to the target <img> via cover.
import { useRef, useState } from 'react'
import { useT } from '../i18n'

export interface Framing {
  posX: number
  posY: number
  zoom: number
}

const clamp = (v: number): number => Math.min(100, Math.max(0, v))

export function FramingModal({
  image,
  aspect,
  circle,
  initial,
  onSave,
  onClose
}: {
  image: string
  aspect: number // stage width / height
  circle?: boolean
  initial: Framing
  onSave: (f: Framing) => void
  onClose: () => void
}): JSX.Element {
  const t = useT()
  const [f, setF] = useState<Framing>(initial)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const onDown = (e: React.PointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px: f.posX, py: f.posY }
  }
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current
    const st = stageRef.current
    if (!d || !st) return
    const r = st.getBoundingClientRect()
    // pan sensitivity scales with zoom (more overflow to travel)
    const k = 100 / (r.width * Math.max(1, f.zoom - 0.4))
    setF((prev) => ({
      ...prev,
      posX: clamp(d.px - (e.clientX - d.x) * k),
      posY: clamp(d.py - (e.clientY - d.y) * (100 / (r.height * Math.max(1, prev.zoom - 0.4))))
    }))
  }
  const onUp = (): void => {
    drag.current = null
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="frame-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-title">{t('crop')}</div>
        <div
          className={'frame-stage' + (circle ? ' circle' : '')}
          ref={stageRef}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              objectPosition: `${f.posX}% ${f.posY}%`,
              transform: `scale(${f.zoom})`
            }}
          />
          <div className="frame-grid" />
        </div>
        <div className="frame-zoom">
          <span>−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={f.zoom}
            onChange={(e) => setF((prev) => ({ ...prev, zoom: Number(e.target.value) }))}
          />
          <span>+</span>
        </div>
        <button className="se-tap" onClick={() => onSave(f)} style={{ marginTop: 12 }}>
          {t('done')}
        </button>
      </div>
    </div>
  )
}
