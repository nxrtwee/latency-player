import { useMemo, useRef, useState } from 'react'

/**
 * Compact HSV colour picker styled to match the app. Perf note: while dragging
 * we only update local state + the live `--accent` CSS variable (cheap). We
 * commit to the store (which persists + re-renders the app) on release, so a
 * drag no longer fires a localStorage write + full re-render every pointermove.
 */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '')
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const int = parseInt(n || '000000', 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (x: number): string => Math.round(x).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g] = [c, x]
  else if (h < 120) [r, g] = [x, c]
  else if (h < 180) [g, b] = [c, x]
  else if (h < 240) [g, b] = [x, c]
  else if (h < 300) [r, b] = [x, c]
  else [r, b] = [c, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

const PRESETS = ['#ff2e54', '#ff5b78', '#3aa0ff', '#8b5cff', '#ff48d0', '#ff5c5c', '#ffb02e', '#1fd6c9']

interface ColorPickerProps {
  value: string
  /** Committed on release / preset click / valid hex entry. */
  onChange: (hex: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps): JSX.Element {
  const [hsv, setHsv] = useState(() => {
    const { r, g, b } = hexToRgb(value)
    return rgbToHsv(r, g, b)
  })
  const [hexText, setHexText] = useState(value)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const latest = useRef(value)

  const hex = useMemo(() => {
    const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
    return rgbToHex(r, g, b)
  }, [hsv])

  const preview = (hx: string): void =>
    document.documentElement.style.setProperty('--accent', hx)

  function apply(next: { h: number; s: number; v: number }): void {
    setHsv(next)
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v)
    const hx = rgbToHex(r, g, b)
    latest.current = hx
    setHexText(hx)
    preview(hx) // live, cheap — no store write during drag
  }

  function dragSV(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = svRef.current!.getBoundingClientRect()
    apply({
      h: hsv.h,
      s: clamp01((e.clientX - rect.left) / rect.width),
      v: clamp01(1 - (e.clientY - rect.top) / rect.height)
    })
  }
  function dragHue(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = hueRef.current!.getBoundingClientRect()
    apply({ h: clamp01((e.clientX - rect.left) / rect.width) * 360, s: hsv.s, v: hsv.v })
  }

  // Generic pointer-drag wiring: track while pressed, commit once on release.
  function makeDrag(move: (e: React.PointerEvent<HTMLDivElement>) => void) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.buttons === 1) move(e)
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* not captured */
        }
        onChange(latest.current) // single commit
      }
    }
  }

  function onHexInput(v: string): void {
    setHexText(v)
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      const hx = v.startsWith('#') ? v : `#${v}`
      const { r, g, b } = hexToRgb(hx)
      setHsv(rgbToHsv(r, g, b))
      latest.current = hx
      preview(hx)
      onChange(hx)
    }
  }

  const hueColor = rgbToHex(hsvToRgb(hsv.h, 1, 1).r, hsvToRgb(hsv.h, 1, 1).g, hsvToRgb(hsv.h, 1, 1).b)

  return (
    <div className="cpicker">
      <div
        ref={svRef}
        className="cp-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        {...makeDrag(dragSV)}
      >
        <span className="cp-sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>

      <div className="cp-row">
        <span className="cp-swatch" style={{ background: hex }} />
        <div ref={hueRef} className="cp-hue" {...makeDrag(dragHue)}>
          <span className="cp-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>

      <div className="cp-row">
        <input
          className="cp-hex"
          value={hexText}
          spellCheck={false}
          onChange={(e) => onHexInput(e.target.value)}
        />
        <div className="cp-presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              className="cp-preset"
              style={{ background: p }}
              title={p}
              onClick={() => {
                const { r, g, b } = hexToRgb(p)
                setHsv(rgbToHsv(r, g, b))
                setHexText(p)
                latest.current = p
                preview(p)
                onChange(p)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
