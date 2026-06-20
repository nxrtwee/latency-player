import type { CSSProperties } from 'react'

interface SliderProps {
  value: number
  max: number
  min?: number
  step?: number
  disabled?: boolean
  className?: string
  onChange: (value: number) => void
  ariaLabel?: string
}

/**
 * Range input with a filled "progress" track. Chromium (Electron) renders the
 * input's own background as the track, so a linear-gradient driven by the
 * current value gives us the played-portion fill cross-thumb.
 */
export function Slider({
  value,
  max,
  min = 0,
  step = 1,
  disabled,
  className,
  onChange,
  ariaLabel
}: SliderProps): JSX.Element {
  const span = max - min
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0
  const style = {
    background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`
  } as CSSProperties

  return (
    <input
      type="range"
      className={`slider ${className ?? ''}`}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      style={style}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
